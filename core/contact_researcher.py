"""
core/contact_researcher.py
===========================
Public Contact Research & Enrichment for SMBFlow Meeting Intelligence.

Performs public professional web search for a known contact using
their name + company/role context from Central Memory.

Provider:
  - Serper.dev Google Search API (SERPER_API_KEY env var)
  - If key is absent or empty: returns status="research_unavailable"
    with ZERO fabricated facts.

Results are structured into:
  - verified_facts:    Explicitly stated facts with source URL + name + date
  - uncertain_matches: Possible matches that need human confirmation
  - ai_talking_points: AI-generated discussion topics labelled as AI suggestions

Identity matching:
  Every raw search result is scored against the known contact identity
  (name + company + role tokens). Results below a confidence threshold
  are placed in uncertain_matches rather than verified_facts.
  Nothing is ever fabricated.

Provenance:
  Every fact/match carries:
    source_url:   the URL from the search result
    source_name:  the hostname / publication name
    retrieved_at: ISO 8601 UTC timestamp of the retrieval

Tenant isolation:
  The caller must pass org_uuid; results are scoped and persisted
  in WorkflowInstance.context["contact_research"] keyed by contact_id.

Usage:
  researcher = ContactResearcher()
  result = await researcher.research(contact_name, company, role, org_uuid)
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import structlog

log = structlog.get_logger()

# ── Serper.dev constants ──────────────────────────────────────────────────────
SERPER_ENDPOINT = "https://google.serper.dev/search"
SERPER_TIMEOUT_SECONDS = 12.0
# Max organic results to consider per query
MAX_RESULTS = 8
# Minimum score for a result to be classified as VERIFIED.
# Requires name + corroborating context — name alone cannot reach this threshold.
IDENTITY_CONFIRM_THRESHOLD = 0.60
# Maximum score name-only match can contribute — kept below threshold intentionally.
_NAME_ONLY_MAX_SCORE = 0.35


# ── Public data models (plain dicts — no ORM, no DB model needed) ─────────────

def _make_fact(content: str, source_url: str, source_name: str, retrieved_at: str) -> Dict[str, Any]:
    return {
        "content": content,
        "source_url": source_url,
        "source_name": source_name,
        "retrieved_at": retrieved_at,
    }


def _make_uncertain(content: str, source_url: str, source_name: str, retrieved_at: str, reason: str) -> Dict[str, Any]:
    return {
        "content": content,
        "source_url": source_url,
        "source_name": source_name,
        "retrieved_at": retrieved_at,
        "uncertainty_reason": reason,
    }


def _make_talking_point(topic: str, rationale: str) -> Dict[str, Any]:
    return {
        "topic": topic,
        "rationale": rationale,
        "label": "AI Suggested — Not Previously Agreed",
    }


# ── Identity matching ─────────────────────────────────────────────────────────

def _identity_score(
    snippet: str,
    title: str,
    contact_name: str,
    company: Optional[str],
    role: Optional[str],
) -> float:
    """
    Return a 0.0–1.0 score indicating how likely this result refers to
    the specific contact (not a different person with the same name).

    KEY INVARIANT:
        Name match alone NEVER reaches IDENTITY_CONFIRM_THRESHOLD (0.60).
        At least one strong corroborating identifier (company OR role) must
        also match. This prevents common-name results (cricketers, politicians,
        executives with the same name) from being classified as VERIFIED.

    Score allocations:
      Name tokens:    up to _NAME_ONLY_MAX_SCORE (0.35) — below threshold
      Company tokens: up to 0.45  — sufficient to push above threshold when combined
      Role tokens:    up to 0.25  — additional boost

    Examples for "Rahul Sharma" (threshold 0.60):
      Name only (cricketer)           → 0.35            → UNCERTAIN  ✓
      Name + "Apex Logistics"         → 0.35+0.45=0.80  → VERIFIED   ✓
      Name + "VP Operations"          → 0.35+0.25=0.60  → VERIFIED   ✓
      Name + unrelated company match  → 0.35+0.00=0.35  → UNCERTAIN  ✓
    """
    text = (title + " " + snippet).lower()

    def _token_overlap(phrase: Optional[str], cap: float) -> float:
        """Fraction of phrase tokens found in text, capped at cap."""
        if not phrase:
            return 0.0
        tokens = [t for t in re.findall(r"[a-z]+", phrase.lower()) if len(t) > 2]
        if not tokens:
            return 0.0
        hits = sum(1 for t in tokens if t in text)
        return min(cap, cap * hits / len(tokens))

    name_score = _token_overlap(contact_name, _NAME_ONLY_MAX_SCORE)
    company_score = _token_overlap(company, 0.45)
    role_score = _token_overlap(role, 0.25)

    return min(1.0, name_score + company_score + role_score)


def _has_corroborating_context(company: Optional[str], role: Optional[str]) -> bool:
    """
    Return True if we have at least one non-name identifier that can
    disambiguate the contact from other people with the same name.
    When False, no result can be VERIFIED (all go to uncertain_matches).
    """
    return bool((company and company.strip()) or (role and role.strip()))


def _extract_source_name(url: str) -> str:
    """Extract a human-readable publication/domain name from a URL."""
    try:
        m = re.search(r"https?://(?:www\.)?([^/]+)", url)
        if m:
            host = m.group(1)
            # Strip common TLD suffixes for readability
            parts = host.split(".")
            if len(parts) >= 2:
                return parts[-2].capitalize()
            return host
    except Exception:
        pass
    return "Unknown Source"


def _dedup_facts(facts: List[Dict]) -> List[Dict]:
    """Remove near-duplicate facts by content similarity."""
    seen: list[str] = []
    out: list[Dict] = []
    for f in facts:
        content_key = re.sub(r"\s+", " ", (f.get("content") or "").lower().strip())[:120]
        if not any(content_key in s or s in content_key for s in seen):
            seen.append(content_key)
            out.append(f)
    return out


# ── LLM talking-point generator ───────────────────────────────────────────────

async def _generate_talking_points(
    contact_name: str,
    company: Optional[str],
    verified_facts: List[Dict],
    existing_memory_summary: Optional[str],
) -> List[Dict[str, str]]:
    """
    Use LLMRouter (mini tier) to generate 2–4 AI suggested discussion topics
    grounded in the verified research facts.
    Always labelled "AI Suggested — Not Previously Agreed".
    Falls back to an empty list on any error.
    """
    from core.llm_router import LLMRouter, LLMMessage

    if not verified_facts:
        return []

    facts_text = "\n".join(f"- {f['content']} (Source: {f['source_name']})" for f in verified_facts[:6])
    memory_text = f"\n\nExisting relationship context:\n{existing_memory_summary[:400]}" if existing_memory_summary else ""

    system = (
        "You are a meeting preparation assistant. Based on publicly researched facts about a contact, "
        "suggest 2–4 brief, specific, professional discussion topics for an upcoming meeting.\n\n"
        "RULES:\n"
        "1. Suggestions must be grounded in the provided facts — no invented claims.\n"
        "2. Keep each topic to one sentence.\n"
        "3. Output ONLY a JSON array: [{\"topic\": \"...\", \"rationale\": \"...\"}]\n"
        "4. Never present these as confirmed agenda items."
    )
    user = (
        f"Contact: {contact_name}"
        + (f" at {company}" if company else "")
        + f"\n\nResearched facts:\n{facts_text}"
        + memory_text
        + "\n\nSuggest discussion topics."
    )

    try:
        llm = LLMRouter()
        raw, _ = await llm.call(
            agent_name="drafting_agent",
            messages=[LLMMessage(role="system", content=system), LLMMessage(role="user", content=user)],
            tier_override="mini",
        )
        cleaned = (raw or "").strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        parsed = json.loads(cleaned.strip())
        if isinstance(parsed, list):
            return [
                _make_talking_point(
                    topic=str(item.get("topic", "")).strip(),
                    rationale=str(item.get("rationale", "")).strip(),
                )
                for item in parsed
                if isinstance(item, dict) and item.get("topic")
            ]
    except Exception as e:
        log.warning("Talking point LLM generation failed", error=str(e))

    return []


# ── Main researcher class ─────────────────────────────────────────────────────

class ContactResearcher:
    """
    Performs public professional web search for a known contact.
    Uses Serper.dev Google Search API when SERPER_API_KEY is configured.
    Returns structured, sourced results with identity confidence scoring.
    Never fabricates facts or sources.
    """

    def __init__(self, serper_api_key: Optional[str] = None):
        self._api_key = serper_api_key or os.getenv("SERPER_API_KEY", "").strip()

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    async def _serper_search(self, query: str) -> List[Dict[str, Any]]:
        """
        Call Serper.dev /search and return the organic results list.
        Raises on HTTP error. Returns empty list on parse failure.
        """
        headers = {
            "X-API-KEY": self._api_key,
            "Content-Type": "application/json",
        }
        payload = {"q": query, "num": MAX_RESULTS, "gl": "us", "hl": "en"}

        async with httpx.AsyncClient(timeout=SERPER_TIMEOUT_SECONDS) as client:
            resp = await client.post(SERPER_ENDPOINT, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("organic", [])

    def _build_queries(
        self,
        contact_name: str,
        company: Optional[str],
        role: Optional[str],
    ) -> List[str]:
        """
        Build 1–2 targeted search queries.
        More context → tighter, more accurate queries.
        """
        name = contact_name.strip()
        parts = [f'"{name}"']
        if company:
            parts.append(f'"{company.strip()}"')
        if role:
            parts.append(f'"{role.strip()}"')

        # Primary: name + company/role
        primary = " ".join(parts[:3]) + " professional"

        # Secondary: name + LinkedIn/professional profile (without role to broaden slightly)
        secondary = f'"{name}" site:linkedin.com'
        if company:
            secondary = f'"{name}" "{company.strip()}" linkedin'

        return [primary, secondary]

    async def research(
        self,
        contact_name: str,
        company: Optional[str] = None,
        role: Optional[str] = None,
        org_uuid: Optional[uuid.UUID] = None,
        existing_memory_summary: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run public research for a contact. Returns a structured result dict.

        Keys:
          status:             "completed" | "research_unavailable" | "no_results" | "error"
          contact_name:       str
          company:            Optional[str]
          role:               Optional[str]
          queries_used:       List[str]
          verified_facts:     List[{content, source_url, source_name, retrieved_at}]
          uncertain_matches:  List[{content, source_url, source_name, retrieved_at, uncertainty_reason}]
          ai_talking_points:  List[{topic, rationale, label}]
          retrieved_at:       ISO 8601 UTC
          provider:           "serper" | "none"
          error:              Optional[str]
        """
        retrieved_at = datetime.now(timezone.utc).isoformat()

        base = {
            "contact_name": contact_name,
            "company": company,
            "role": role,
            "queries_used": [],
            "verified_facts": [],
            "uncertain_matches": [],
            "ai_talking_points": [],
            "retrieved_at": retrieved_at,
            "provider": "none",
            "error": None,
        }

        # ── Guard: no provider ────────────────────────────────────────────────
        if not self.is_available:
            log.info("ContactResearcher: SERPER_API_KEY not configured — research unavailable")
            return {**base, "status": "research_unavailable"}

        queries = self._build_queries(contact_name, company, role)
        base["queries_used"] = queries
        base["provider"] = "serper"

        # ── Run queries ───────────────────────────────────────────────────────
        raw_results: List[Dict] = []
        for query in queries:
            try:
                results = await self._serper_search(query)
                raw_results.extend(results)
                log.info("Serper search completed", query=query[:80], results=len(results))
            except httpx.HTTPStatusError as e:
                log.warning("Serper HTTP error", query=query[:80], status=e.response.status_code)
                if e.response.status_code in (401, 403):
                    return {**base, "status": "research_unavailable", "error": f"Serper API key invalid or quota exceeded (HTTP {e.response.status_code})"}
            except Exception as e:
                log.warning("Serper search failed", query=query[:80], error=str(e))

        if not raw_results:
            return {**base, "status": "no_results"}

        # ── Deduplicate raw results by URL ────────────────────────────────────
        seen_urls: set[str] = set()
        unique_results: List[Dict] = []
        for r in raw_results:
            url = r.get("link") or r.get("url") or ""
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_results.append(r)

        # ── Score each result for identity match ──────────────────────────────
        verified_facts: List[Dict] = []
        uncertain_matches: List[Dict] = []

        # If we have no corroborating context (no company, no role) we cannot
        # disambiguate this person from others with the same name.
        # ALL results become uncertain_matches in that case.
        can_verify = _has_corroborating_context(company, role)
        no_corroboration_reason = (
            "No company or role known for this contact — cannot disambiguate from "
            "other people with the same name. Add company/role to Central Memory to enable verification."
        )

        for r in unique_results[:MAX_RESULTS * 2]:
            title = r.get("title") or ""
            snippet = r.get("snippet") or ""
            url = r.get("link") or r.get("url") or ""
            source_name = r.get("source") or _extract_source_name(url)

            if not snippet or not url:
                continue

            # Build a concise fact string: title + snippet trimmed
            content = title.strip()
            if snippet.strip() and snippet.strip().lower() != title.strip().lower():
                content = f"{title.strip()} — {snippet.strip()[:200]}"

            if not can_verify:
                # No corroborating context → all results are uncertain
                uncertain_matches.append(
                    _make_uncertain(
                        content, url, source_name, retrieved_at,
                        reason=no_corroboration_reason,
                    )
                )
                continue

            score = _identity_score(snippet, title, contact_name, company, role)
            fact = _make_fact(content, url, source_name, retrieved_at)

            if score >= IDENTITY_CONFIRM_THRESHOLD:
                verified_facts.append(fact)
            else:
                uncertain_matches.append(
                    _make_uncertain(
                        content, url, source_name, retrieved_at,
                        reason=f"Low identity confidence (score={score:.2f}): may be a different person with the same name.",
                    )
                )

        # Deduplicate by content similarity
        verified_facts = _dedup_facts(verified_facts)
        uncertain_matches = _dedup_facts(uncertain_matches)

        # ── Generate AI talking points from verified facts ────────────────────
        talking_points: List[Dict] = []
        if verified_facts:
            talking_points = await _generate_talking_points(
                contact_name=contact_name,
                company=company,
                verified_facts=verified_facts,
                existing_memory_summary=existing_memory_summary,
            )

        status = "completed" if verified_facts or uncertain_matches else "no_results"

        return {
            **base,
            "status": status,
            "verified_facts": verified_facts,
            "uncertain_matches": uncertain_matches,
            "ai_talking_points": talking_points,
        }

    def build_cache_key(
        self,
        contact_name: str,
        company: Optional[str],
        role: Optional[str],
        org_uuid: uuid.UUID,
    ) -> str:
        """
        Deterministic idempotency key for a research request.
        Scoped by org so two orgs researching the same name stay separate.
        """
        raw = f"{org_uuid}:{contact_name.strip().lower()}:{(company or '').strip().lower()}:{(role or '').strip().lower()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:32]
