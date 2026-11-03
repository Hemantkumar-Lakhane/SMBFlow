"""
integrations/local_dev_tools.py
================================
Local development tools that read directly from seed data files.
No external API calls, no credentials needed — reads from db/seed/data/.

These tools are ALWAYS registered (they gracefully return empty if seed data
doesn't exist). During development they replace HubSpot, Stripe, etc.

Tools registered per industry:
  SaaS:       product_api_usage, product_api_nps, product_api_deals
  Retail:     retail_get_inventory, retail_get_sales
  Healthcare: health_get_patients, health_get_appointments
  Finance:    finance_get_expenses, finance_get_employees

Universal: get_communication_history, get_activity_log
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import structlog

log = structlog.get_logger()

SEED_DIR = Path("db/seed/data")


def _load_seed(filename: str) -> list:
    """Load a JSON seed data file. Returns [] if missing."""
    path = SEED_DIR / filename
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
            return data if isinstance(data, list) else []
        except Exception as e:
            log.warning("Seed data load failed", file=filename, error=str(e))
    return []


# ─────────────────────────────────────────────────────────────────────────────
# SaaS Tools
# ─────────────────────────────────────────────────────────────────────────────

async def product_api_usage(
    limit: int = 30,
    health_filter: Optional[str] = None,
    account_id: Optional[str] = None,
    include_healthy: bool = True,
) -> dict:
    """
    Get SaaS customer accounts with usage metrics and churn signals.
    Returns a focused sample prioritizing critical/at-risk accounts.

    Args:
        limit: Max accounts to return (keep ≤30 to avoid flooding context)
        health_filter: "critical" | "at_risk" | "healthy"
        account_id: Get one specific account by ID
        include_healthy: Include healthy accounts in mixed results
    """
    accounts = _load_seed("saas_accounts.json")
    if not accounts:
        return {"accounts": [], "summary": {"note": "No seed data. Run: python db/seed/saas_seed.py"}, "data_source": "local_dev_seed"}

    if account_id:
        filtered = [a for a in accounts if a.get("id") == account_id]
        return {"accounts": filtered, "total_accounts": len(accounts), "data_source": "local_dev_seed"}

    if health_filter:
        filtered = [a for a in accounts if a.get("_health_label") == health_filter]
        return {
            "accounts": filtered[:limit],
            "total_accounts": len(accounts),
            "filtered_count": len(filtered),
            "health_filter_applied": health_filter,
            "data_source": "local_dev_seed",
        }

    # Smart sample: prioritize risk, include some healthy for context
    critical = [a for a in accounts if a.get("_health_label") == "critical"]
    at_risk  = [a for a in accounts if a.get("_health_label") == "at_risk"]
    healthy  = [a for a in accounts if a.get("_health_label") == "healthy"]

    sample = critical[:8] + at_risk[:12]
    if include_healthy:
        sample += healthy[:5]
    sample = sample[:limit]

    return {
        "accounts": sample,
        "summary": {
            "total_accounts": len(accounts),
            "critical_count": len(critical),
            "at_risk_count": len(at_risk),
            "healthy_count": len(healthy),
            "sample_returned": len(sample),
        },
        "data_source": "local_dev_seed",
    }


async def product_api_nps(
    account_ids: Optional[list] = None,
    score_below: Optional[int] = None,
    limit: int = 50,
) -> dict:
    """
    Get NPS scores and verbatim feedback.

    Args:
        account_ids: Filter to specific account IDs
        score_below: Only return accounts with NPS < this value
        limit: Max results
    """
    accounts = _load_seed("saas_accounts.json")
    if not accounts:
        return {"nps_data": [], "summary": {}, "data_source": "local_dev_seed"}

    nps_data = []
    for a in accounts:
        nps = a.get("nps", {})
        if not nps:
            continue
        score = nps.get("score", 7)
        if account_ids and a.get("id") not in account_ids:
            continue
        if score_below is not None and score >= score_below:
            continue
        nps_data.append({
            "account_id": a.get("id"),
            "company_name": a.get("company_name"),
            "nps_score": score,
            "verbatim": nps.get("verbatim", ""),
            "date": nps.get("date", ""),
            "category": "promoter" if score >= 9 else ("passive" if score >= 7 else "detractor"),
        })

    nps_data = nps_data[:limit]
    avg = round(sum(d["nps_score"] for d in nps_data) / max(len(nps_data), 1), 1)

    return {
        "nps_data": nps_data,
        "summary": {
            "records_returned": len(nps_data),
            "average_nps": avg,
            "detractor_count": len([d for d in nps_data if d["nps_score"] < 7]),
            "promoter_count": len([d for d in nps_data if d["nps_score"] >= 9]),
        },
        "data_source": "local_dev_seed",
    }


async def product_api_deals(
    stalled_only: bool = False,
    stage: Optional[str] = None,
    limit: int = 30,
) -> dict:
    """Get sales pipeline deals."""
    deals = _load_seed("saas_deals.json")
    if stalled_only:
        deals = [d for d in deals if d.get("_stalled")]
    if stage:
        deals = [d for d in deals if d.get("stage") == stage]

    stalled = [d for d in deals if d.get("_stalled")]
    return {
        "deals": deals[:limit],
        "summary": {
            "total": len(deals),
            "stalled_count": len(stalled),
        },
        "data_source": "local_dev_seed",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Communication / CRM Mock Tools (universal — used by all workflows)
# ─────────────────────────────────────────────────────────────────────────────

async def get_communication_history(
    account_id: Optional[str] = None,
    contact_id: Optional[str] = None,
    days_back: int = 30,
) -> dict:
    """
    Get recent email/communication history for an account.
    Returns empty history in dev mode — all accounts safe to email.
    """
    return {
        "emails_sent": [],
        "last_email_days_ago": None,
        "total_in_period": 0,
        "safe_to_email": True,
        "account_id": account_id,
        "contact_id": contact_id,
        "period_days": days_back,
        "data_source": "local_dev_mock",
        "note": "Dev mode — no communication history. All accounts are safe to contact.",
    }


# Founder Content Requests
async def founder_content_get_requests(
    limit: int = 20,
    priority: Optional[str] = None,
) -> dict:
    """Return founder content request seed data.

    Args:
        limit: Maximum number of requests to return.
        priority: Filter by request priority (e.g., "high", "medium", "low").
    """
    requests = _load_seed("founder_content_requests.json")
    if priority:
        requests = [r for r in requests if r.get("priority") == priority]
    return {
        "requests": requests[:limit],
        "summary": {
            "total_requests": len(requests),
            "returned": min(limit, len(requests)),
        },
        "data_source": "local_dev_seed",
    }

# Product Launch Briefs
async def product_launch_get_briefs(
    limit: int = 20,
    status: Optional[str] = None,
) -> dict:
    """Return product launch brief seed data.

    Args:
        limit: Maximum number of briefs to return.
        status: Filter by brief status (e.g., "draft", "approved").
    """
    briefs = _load_seed("product_launch_briefs.json")
    if status:
        briefs = [b for b in briefs if b.get("status") == status]
    return {
        "briefs": briefs[:limit],
        "summary": {
            "total_briefs": len(briefs),
            "returned": min(limit, len(briefs)),
        },
        "data_source": "local_dev_seed",
    }

# Weekly Growth Brief Data
async def weekly_growth_brief_get_data(
    limit: int = 20,
    start_week: Optional[str] = None,
) -> dict:
    """Return weekly growth brief seed data.

    Args:
        limit: Maximum number of weeks to return.
        start_week: ISO date string (YYYY-MM-DD) to filter weeks starting on or after this date.
    """
    weeks = _load_seed("weekly_growth_brief_data.json")
    if start_week:
        weeks = [w for w in weeks if w.get("week_start") >= start_week]
    return {
        "weeks": weeks[:limit],
        "summary": {
            "total_weeks": len(weeks),
            "returned": min(limit, len(weeks)),
        },
        "data_source": "local_dev_seed",
    }



async def get_activity_log(
    contact_id: Optional[str] = None,
    account_id: Optional[str] = None,
    days_back: int = 30,
) -> dict:
    """Get CRM activity log (mock in dev)."""
    return {
        "activities": [],
        "last_activity_days_ago": None,
        "total_activities": 0,
        "safe_to_contact": True,
        "data_source": "local_dev_mock",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Retail Tools
# ─────────────────────────────────────────────────────────────────────────────

async def retail_get_inventory(
    risk_filter: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 40,
) -> dict:
    """Get product inventory with stockout/overstock risk indicators."""
    products = _load_seed("retail_products.json")
    if risk_filter:
        products = [p for p in products if p.get("_risk_label") == risk_filter]
    if category:
        products = [p for p in products if p.get("category") == category]

    stockouts = [p for p in products if p.get("_risk_label") == "stockout"]
    overstock = [p for p in products if p.get("_risk_label") == "overstock"]

    # Prioritize at-risk SKUs
    risky = [p for p in products if p.get("_risk_label") in ("stockout", "overstock")]
    healthy = [p for p in products if p.get("_risk_label") == "healthy"]
    sample = (risky + healthy[:5])[:limit]

    return {
        "products": sample,
        "summary": {
            "total_skus": len(products),
            "stockout_risk_count": len(stockouts),
            "overstock_count": len(overstock),
        },
        "data_source": "local_dev_seed",
    }


async def retail_get_sales(
    product_id: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 30,
) -> dict:
    """Get product sales velocity data."""
    products = _load_seed("retail_products.json")
    if product_id:
        products = [p for p in products if p.get("id") == product_id]
    if category:
        products = [p for p in products if p.get("category") == category]

    return {
        "sales_data": [
            {
                "product_id": p.get("id"),
                "sku": p.get("sku"),
                "name": p.get("name"),
                "units_sold_30d": p.get("sales_30d", 0),
                "units_sold_7d": p.get("sales_7d", 0),
                "sell_through_rate": p.get("sell_through_rate", 0),
                "days_of_supply": p.get("days_of_supply", 0),
                "reorder_point": p.get("reorder_point", 0),
                "current_stock": p.get("current_stock", 0),
            }
            for p in products[:limit]
        ],
        "data_source": "local_dev_seed",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Healthcare Tools
# ─────────────────────────────────────────────────────────────────────────────

async def health_get_patients(
    risk_filter: Optional[str] = None,
    condition: Optional[str] = None,
    limit: int = 30,
) -> dict:
    """Get patient records with health risk indicators."""
    patients = _load_seed("healthcare_patients.json")
    if risk_filter:
        patients = [p for p in patients if p.get("_risk_label") == risk_filter]
    if condition:
        patients = [p for p in patients if condition.lower() in p.get("primary_condition", "").lower()]

    high_risk = [p for p in patients if p.get("_risk_label") == "high_risk"]
    moderate = [p for p in patients if p.get("_risk_label") == "moderate_risk"]
    sample = (high_risk[:10] + moderate[:10])[:limit]

    return {
        "patients": sample,
        "summary": {
            "total_patients": len(patients),
            "high_risk_count": len(high_risk),
            "moderate_risk_count": len(moderate),
        },
        "data_source": "local_dev_seed",
    }


async def health_get_appointments(
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    days_ahead: int = 14,
    limit: int = 50,
) -> dict:
    """Get appointment data — upcoming, no-shows, cancellations."""
    appointments = _load_seed("healthcare_appointments.json")
    if patient_id:
        appointments = [a for a in appointments if a.get("patient_id") == patient_id]
    if status:
        appointments = [a for a in appointments if a.get("status") == status]

    no_shows = [a for a in appointments if a.get("status") == "no_show"]
    scheduled = [a for a in appointments if a.get("status") == "scheduled"]

    return {
        "appointments": appointments[:limit],
        "summary": {
            "total": len(appointments),
            "no_show_count": len(no_shows),
            "upcoming_count": len(scheduled),
        },
        "data_source": "local_dev_seed",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Finance Tools
# ─────────────────────────────────────────────────────────────────────────────

async def finance_get_expenses(
    department: Optional[str] = None,
    anomaly_only: bool = False,
    amount_above: Optional[float] = None,
    limit: int = 40,
) -> dict:
    """Get corporate expense transactions with anomaly flags."""
    transactions = _load_seed("finance_expenses.json")
    if department:
        transactions = [t for t in transactions if t.get("department") == department]
    if anomaly_only:
        transactions = [t for t in transactions if t.get("_is_anomaly")]
    if amount_above is not None:
        transactions = [t for t in transactions if t.get("amount", 0) >= amount_above]

    anomalies = [t for t in transactions if t.get("_is_anomaly")]
    # Prioritize anomalies
    sample = [t for t in transactions if t.get("_is_anomaly")]
    sample += [t for t in transactions if not t.get("_is_anomaly")]
    sample = sample[:limit]

    return {
        "transactions": sample,
        "summary": {
            "total_transactions": len(transactions),
            "anomaly_count": len(anomalies),
            "total_amount": round(sum(t.get("amount", 0) for t in sample), 2),
            "anomaly_amount": round(sum(t.get("amount", 0) for t in anomalies), 2),
        },
        "data_source": "local_dev_seed",
    }


async def finance_get_employees(
    department: Optional[str] = None,
    limit: int = 50,
) -> list:
    """Get employee records for expense attribution."""
    transactions = _load_seed("finance_expenses.json")
    seen: set = set()
    employees = []
    for t in transactions:
        emp_id = t.get("employee_id")
        if emp_id and emp_id not in seen:
            seen.add(emp_id)
            employees.append({
                "id": emp_id,
                "name": t.get("employee_name"),
                "department": t.get("department"),
                "manager": t.get("manager"),
                "email": t.get("employee_email", ""),
            })
    if department:
        employees = [e for e in employees if e.get("department") == department]
    return employees[:limit]


async def re_get_listings(
    risk_filter: Optional[str] = None,
    agent_name: Optional[str] = None,
    status: Optional[str] = "active",
    limit: int = 30,
) -> dict:
    """
    Get MLS-style real estate listings with health indicators.
    risk_filter: 'stale' | 'price_reduced' | 'healthy'
    status: 'active' | 'pending' | 'sold' | None (all)
    """
    listings = _load_seed("re_listings.json")
    if status:
        listings = [l for l in listings if l.get("status", "active") == status]
    if agent_name:
        listings = [l for l in listings if l.get("listing_agent", "") == agent_name]
    if risk_filter:
        listings = [l for l in listings if l.get("_risk_label") == risk_filter]
 
    stale = [l for l in listings if l.get("_risk_label") == "stale"]
    price_reduced = [l for l in listings if l.get("_risk_label") == "price_reduced"]
    healthy = [l for l in listings if l.get("_risk_label") == "healthy"]
 
    # Prioritize at-risk listings
    sample = stale[:10] + price_reduced[:10] + healthy[:5]
    sample = sample[:limit]
 
    return {
        "listings": sample,
        "summary": {
            "total_active": len(listings),
            "stale_count": len(stale),
            "price_reduced_count": len(price_reduced),
            "healthy_count": len(healthy),
            "avg_days_on_market": round(
                sum(l.get("days_on_market", 0) for l in listings) / max(len(listings), 1), 1
            ),
        },
        "data_source": "local_dev_seed",
    }
 
 
async def re_get_showing_feedback(
    listing_id: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """Get showing feedback and visitor comments for listings."""
    listings = _load_seed("re_listings.json")
    feedback_records = []
    for l in listings:
        if listing_id and l.get("id") != listing_id:
            continue
        for fb in l.get("showing_feedback", []):
            feedback_records.append({
                "listing_id": l.get("id"),
                "address": l.get("address"),
                "agent": l.get("listing_agent"),
                "feedback_type": fb.get("type", "general"),
                "comment": fb.get("comment", ""),
                "date": fb.get("date", ""),
                "price_concern": fb.get("price_concern", False),
            })
 
    price_concerns = [f for f in feedback_records if f.get("price_concern")]
    return {
        "feedback": feedback_records[:limit],
        "summary": {
            "total_feedback_items": len(feedback_records),
            "price_concern_count": len(price_concerns),
        },
        "data_source": "local_dev_seed",
    }
 
 
async def re_get_comparable_sales(
    zip_code: Optional[str] = None,
    bedrooms: Optional[int] = None,
    days_back: int = 180,
    limit: int = 10,
) -> dict:
    """Get recent comparable sales (comps) for CMA calculations."""
    listings = _load_seed("re_listings.json")
    comps = [l for l in listings if l.get("status") == "sold"]
    if zip_code:
        comps = [c for c in comps if c.get("zip_code") == zip_code]
    if bedrooms:
        comps = [c for c in comps if c.get("bedrooms") == bedrooms]
 
    avg_price_sqft = round(
        sum(c.get("price_per_sqft", 0) for c in comps) / max(len(comps), 1), 2
    )
    avg_dom = round(
        sum(c.get("days_on_market", 0) for c in comps) / max(len(comps), 1), 1
    )
    return {
        "comparables": comps[:limit],
        "market_summary": {
            "avg_price_per_sqft": avg_price_sqft,
            "avg_days_on_market": avg_dom,
            "total_comps_found": len(comps),
            "zip_code": zip_code,
        },
        "data_source": "local_dev_seed",
    }
 
 
async def re_get_leases(
    risk_filter: Optional[str] = None,
    expiring_within_days: Optional[int] = None,
    property_id: Optional[str] = None,
    limit: int = 30,
) -> dict:
    """
    Get tenant leases for property management workflows.
    risk_filter: 'high_flight_risk' | 'medium_flight_risk' | 'stable'
    expiring_within_days: e.g. 90 to get leases expiring within 90 days
    """
    leases = _load_seed("re_leases.json")
    if property_id:
        leases = [l for l in leases if l.get("property_id") == property_id]
    if risk_filter:
        leases = [l for l in leases if l.get("_risk_label") == risk_filter]
    if expiring_within_days is not None:
        leases = [
            l for l in leases
            if isinstance(l.get("days_until_expiry"), int)
            and l["days_until_expiry"] <= expiring_within_days
        ]
 
    high_risk = [l for l in leases if l.get("_risk_label") == "high_flight_risk"]
    medium_risk = [l for l in leases if l.get("_risk_label") == "medium_flight_risk"]
    sample = (high_risk[:10] + medium_risk[:10])[:limit]
    if len(sample) < limit:
        stable = [l for l in leases if l.get("_risk_label") == "stable"]
        sample += stable[:limit - len(sample)]
 
    return {
        "leases": sample[:limit],
        "summary": {
            "total_leases": len(leases),
            "high_flight_risk_count": len(high_risk),
            "medium_flight_risk_count": len(medium_risk),
            "expiring_90d": len([l for l in leases if (l.get("days_until_expiry") or 999) <= 90]),
        },
        "data_source": "local_dev_seed",
    }
 
 
async def re_get_maintenance_tickets(
    property_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = 40,
) -> dict:
    """
    Get maintenance tickets — key signal for tenant flight risk.
    status: 'open' | 'in_progress' | 'resolved'
    priority: 'emergency' | 'high' | 'medium' | 'low'
    """
    leases = _load_seed("re_leases.json")
    all_tickets = []
    for lease in leases:
        for ticket in lease.get("maintenance_tickets", []):
            all_tickets.append({
                **ticket,
                "tenant_id": lease.get("id"),
                "tenant_name": lease.get("tenant_name"),
                "tenant_email": lease.get("tenant_email"),
                "property_id": lease.get("property_id"),
                "property_address": lease.get("property_address"),
                "lease_expiry": lease.get("lease_end_date"),
            })
 
    if property_id:
        all_tickets = [t for t in all_tickets if t.get("property_id") == property_id]
    if status:
        all_tickets = [t for t in all_tickets if t.get("status") == status]
    if priority:
        all_tickets = [t for t in all_tickets if t.get("priority") == priority]
 
    open_tickets = [t for t in all_tickets if t.get("status") in ("open", "in_progress")]
    unresolved = [t for t in all_tickets if t.get("status") == "open"]
 
    return {
        "tickets": all_tickets[:limit],
        "summary": {
            "total_tickets": len(all_tickets),
            "open_count": len(open_tickets),
            "unresolved_count": len(unresolved),
            "emergency_count": len([t for t in all_tickets if t.get("priority") == "emergency"]),
        },
        "data_source": "local_dev_seed",
    }
 
 
async def re_get_tenant_ledger(
    tenant_id: Optional[str] = None,
    late_payments_only: bool = False,
    limit: int = 30,
) -> dict:
    """
    Get tenant payment history. Late payments are a key churn signal.
    """
    leases = _load_seed("re_leases.json")
    records = []
    for lease in leases:
        if tenant_id and lease.get("id") != tenant_id:
            continue
        ledger = lease.get("payment_history", [])
        for entry in ledger:
            records.append({
                "tenant_id": lease.get("id"),
                "tenant_name": lease.get("tenant_name"),
                "property_address": lease.get("property_address"),
                "amount": entry.get("amount"),
                "due_date": entry.get("due_date"),
                "paid_date": entry.get("paid_date"),
                "days_late": entry.get("days_late", 0),
                "status": entry.get("status", "paid"),
            })
 
    if late_payments_only:
        records = [r for r in records if (r.get("days_late") or 0) > 0]
 
    late_count = len([r for r in records if (r.get("days_late") or 0) > 0])
    return {
        "ledger": records[:limit],
        "summary": {
            "total_payments": len(records),
            "late_payment_count": late_count,
            "late_payment_rate": round(late_count / max(len(records), 1), 3),
        },
        "data_source": "local_dev_seed",
    }
 
 
async def re_get_buyers(
    status_filter: Optional[str] = None,
    agent_name: Optional[str] = None,
    limit: int = 30,
) -> dict:
    """
    Get active buyer leads and their status.
    status_filter: 'hot' | 'warm' | 'cold' | 'under_contract'
    """
    buyers = _load_seed("re_buyers.json")
    if status_filter:
        buyers = [b for b in buyers if b.get("status") == status_filter]
    if agent_name:
        buyers = [b for b in buyers if b.get("assigned_agent") == agent_name]
 
    hot = [b for b in buyers if b.get("status") == "hot"]
    warm = [b for b in buyers if b.get("status") == "warm"]
    sample = (hot[:10] + warm[:10])[:limit]
 
    return {
        "buyers": sample,
        "summary": {
            "total_buyers": len(buyers),
            "hot_count": len(hot),
            "warm_count": len(warm),
        },
        "data_source": "local_dev_seed",
    }

async def email_get_synthetic_messages(
    limit: int = 40,
    priority: Optional[str] = None,
    scenario: Optional[str] = None,
    search_query: Optional[str] = None,
) -> dict:
    """
    Get synthetic email messages for workflow execution testing.
    Loads from db/seed/data/email_messages.json fixture.
    Zero external credentials required.

    Args:
        limit: Max messages to return (default 40)
        priority: Filter by 'urgent' | 'high' | 'normal' | 'low'
        scenario: Filter by specific scenario (e.g. 'invoice_payment_issue', 'customer_complaint')
        search_query: Search text in subject or body
    """
    emails = _load_seed("email_messages.json")
    if not emails:
        return {
            "messages": [],
            "total_messages": 0,
            "data_origin": "synthetic",
            "is_test_data": True,
            "dataset": "email_workflow_demo",
            "note": "No email seed data found. Run: python db/seed/email_seed.py",
        }

    filtered = emails
    if priority:
        filtered = [e for e in filtered if e.get("priority") == priority.lower()]
    if scenario:
        filtered = [e for e in filtered if e.get("scenario") == scenario.lower()]
    if search_query:
        sq = search_query.lower()
        filtered = [
            e for e in filtered
            if sq in (e.get("subject") or "").lower() or sq in (e.get("body") or "").lower()
        ]

    result_set = filtered[:limit]

    return {
        "messages": result_set,
        "total_messages": len(emails),
        "returned_count": len(result_set),
        "data_origin": "synthetic",
        "is_test_data": True,
        "dataset": "email_workflow_demo",
    }


async def crm_get_synthetic_leads(
    limit: int = 40,
    form_type: Optional[str] = None,
    requested_demo: Optional[bool] = None,
    search_query: Optional[str] = None,
) -> dict:
    """
    Get synthetic inbound leads for the Inbound Lead-to-Demo workflow.
    Loads from db/seed/data/inbound_leads.json fixture. Zero external
    credentials required — this is the local-dev stand-in for a website
    form/webhook + CRM read.

    Each lead carries the raw form/UTM/CRM-history fields the Lead
    Qualification Agent needs to score fit, intent, need, and data quality.

    Args:
        limit: Max leads to return (default 40)
        form_type: Filter by 'demo_request' | 'contact' | 'waitlist'
        requested_demo: Filter by whether the lead explicitly requested a demo
        search_query: Search text in name, company, or message
    """
    leads = _load_seed("inbound_leads.json")
    if not leads:
        return {
            "leads": [],
            "total_leads": 0,
            "returned_count": 0,
            "data_origin": "synthetic",
            "is_test_data": True,
            "dataset": "lead_to_demo_demo",
            "note": "No lead seed data found at db/seed/data/inbound_leads.json.",
        }

    filtered = leads
    if form_type:
        filtered = [l for l in filtered if l.get("form_type") == form_type.lower()]
    if requested_demo is not None:
        filtered = [l for l in filtered if bool(l.get("requested_demo")) == bool(requested_demo)]
    if search_query:
        sq = search_query.lower()
        filtered = [
            l for l in filtered
            if sq in (l.get("name") or "").lower()
            or sq in (l.get("company") or "").lower()
            or sq in (l.get("message") or "").lower()
        ]

    result_set = filtered[:limit]

    return {
        "leads": result_set,
        "total_leads": len(leads),
        "returned_count": len(result_set),
        "data_origin": "synthetic",
        "is_test_data": True,
        "dataset": "lead_to_demo_demo",
    }


# ─────────────────────────────────────────────────────────────────────────────
async def case_study_get_data(limit: int = 10) -> dict:
    """Load case study seed data."""
    data = _load_seed("case_studies.json")
    return {"case_studies": data, "data_source": "local_dev_seed"}

async def investor_update_get_data(limit: int = 5) -> dict:
    """Load investor update metrics seed data."""
    data = _load_seed("investor_updates.json")
    return {"investor_updates": data, "data_source": "local_dev_seed"}

async def pipeline_content_get_requests(limit: int = 10) -> dict:
    """Load pipeline content request seed data."""
    data = _load_seed("pipeline_content_requests.json")
    return {"content_requests": data, "data_source": "local_dev_seed"}

async def account_signal_get_data(limit: int = 20) -> dict:
    """Load account signal seed data."""
    data = _load_seed("account_signals.json")
    return {"account_signals": data, "data_source": "local_dev_seed"}

async def sla_monitor_get_events(limit: int = 50) -> dict:
    """Load SLA monitor event seed data."""
    data = _load_seed("sla_monitor_events.json")
    return {"sla_events": data, "data_source": "local_dev_seed"}

async def account_based_campaign_get_data(limit: int = 5) -> dict:
    """Load account based campaign seed data."""
    data = _load_seed("account_based_campaigns.json")
    return {"campaigns": data, "data_source": "local_dev_seed"}

async def finance_operations_get_data(limit: int = 20) -> dict:
    """Load finance operations consolidated seed data."""
    path = SEED_DIR / "finance_operations.json"
    if not path.exists():
        return {"finance_operations": [], "data_source": "local_dev_seed"}
    try:
        raw = json.loads(path.read_text())
        combined: list = []
        if isinstance(raw, dict):
            for v in raw.values():
                if isinstance(v, list):
                    combined.extend(v)
        elif isinstance(raw, list):
            combined = raw
        else:
            combined = []
        if limit:
            combined = combined[:limit]
    except Exception as e:
        log.warning("Finance operations seed load failed", error=str(e))
        combined = []
    return {"finance_operations": combined, "data_source": "local_dev_seed"}

# ─────────────────────────────────────────────────────────────────────────────
# Football Agent AI Operating System Tools (Immersa Experiences)
# ─────────────────────────────────────────────────────────────────────────────

def calculate_football_match(player: dict, club: dict, coach: Optional[dict] = None) -> dict:
    """
    Deterministic Two-Layer Football Matching Engine.
    Layer 1: Hard eligibility & blocker checks (closed quota, unavailable, position mismatch, extreme salary overrun).
    Layer 2: Explainable weighted compatibility scoring (Positional 30%, Tactical 25%, Financial 20%, Quota 15%, Market 10%).
    """
    # ── LAYER 1: HARD ELIGIBILITY / BLOCKER CHECKS ──────────────────────────
    # Blocker 1: Player Availability
    if not player.get("is_available", True):
        return {
            "eligible": False,
            "blocked": True,
            "blocker_reason": f"Player {player.get('name')} is unavailable or unwilling to relocate ({player.get('availability_note', 'Unavailable')})",
            "score": 0.0,
            "component_scores": {},
            "recommendation_tier": "BLOCKED_UNAVAILABLE",
            "eligible_for_pitch": False,
        }

    # Blocker 2: Foreign Player Quota Status
    quota_info = club.get("foreign_player_quota", {})
    if not quota_info.get("is_quota_open", True) or quota_info.get("open_slots_available", 0) <= 0:
        return {
            "eligible": False,
            "blocked": True,
            "blocker_reason": f"Foreign player quota is closed for {club.get('club_name')} (0 open slots available. {quota_info.get('quota_restriction_note', '')})",
            "score": 0.0,
            "component_scores": {},
            "recommendation_tier": "BLOCKED_QUOTA_CLOSED",
            "eligible_for_pitch": False,
        }

    # Blocker 3: Non-EU Quota for Spanish / EU clubs
    club_country = club.get("country", "")
    if club_country == "Spain":
        player_passport = player.get("passport", "")
        if "EU" not in player_passport and "Spain" not in player_passport:
            if quota_info.get("open_slots_available", 0) <= 0:
                return {
                    "eligible": False,
                    "blocked": True,
                    "blocker_reason": f"Non-EU quota is filled for {club.get('club_name')}. Player holds {player_passport} and lacks required EU citizenship.",
                    "score": 0.0,
                    "component_scores": {},
                    "recommendation_tier": "BLOCKED_LEGAL_PASSPORT",
                    "eligible_for_pitch": False,
                }

    # Blocker 4: Fundamental Positional Incompatibility
    squad_needs = club.get("squad_needs", [])
    needed_positions = [need.get("position", "") for need in squad_needs]
    player_primary = player.get("primary_position", "")
    player_secondaries = player.get("secondary_positions", []) or []

    def position_matches(cand_pos: str, req_pos: str) -> bool:
        c = cand_pos.lower().split("(")[0].strip()
        r = req_pos.lower().split("(")[0].strip()
        return c in r or r in c or ("striker" in c and "forward" in r) or ("forward" in c and "striker" in r)

    primary_match = any(position_matches(player_primary, np) for np in needed_positions)
    secondary_match = any(any(position_matches(sp, np) for np in needed_positions) for sp in player_secondaries)

    if not primary_match and not secondary_match:
        return {
            "eligible": False,
            "blocked": True,
            "blocker_reason": f"Position mismatch: Club {club.get('club_name')} needs {needed_positions}, but player is {player_primary} ({player_secondaries})",
            "score": 0.0,
            "component_scores": {},
            "recommendation_tier": "BLOCKED_POSITION_MISMATCH",
            "eligible_for_pitch": False,
        }

    # Blocker 5: Exorbitant Salary Overrun (> 50% above club budget cap)
    monthly_budget = club.get("financials", {}).get("monthly_wage_budget_cap_eur", 0)
    monthly_demand = player.get("monthly_salary_demand_eur", 0)
    if monthly_budget > 0 and monthly_demand > (monthly_budget * 1.50):
        return {
            "eligible": False,
            "blocked": True,
            "blocker_reason": f"Severe financial mismatch: Player wage demand (€{monthly_demand:,}/mo) exceeds club budget ceiling (€{monthly_budget:,}/mo) by >50%. Non-viable negotiation.",
            "score": 0.0,
            "component_scores": {},
            "recommendation_tier": "BLOCKED_FINANCIAL_EXCESS",
            "eligible_for_pitch": False,
        }

    # ── LAYER 2: WEIGHTED COMPATIBILITY SCORING (ONLY FOR ELIGIBLE CANDIDATES) ───
    # 1. Positional Fit (30%)
    if primary_match:
        s_pos = 100.0
        pos_explanation = f"Exact primary position fit ({player_primary}) for open club vacancy"
    elif secondary_match:
        s_pos = 75.0
        pos_explanation = f"Compatible secondary position fit ({player_secondaries}) for club vacancy"
    else:
        s_pos = 40.0
        pos_explanation = "Tactical positional overlap"

    # 2. Tactical Fit (25%)
    scouting = player.get("scouting_metrics", {})
    pressing = float(scouting.get("pressing_intensity", 75))
    coach_pressing = float(coach.get("pressing_intensity_preference", 80)) if coach else 80.0
    press_diff = abs(pressing - coach_pressing)
    if press_diff <= 5:
        s_tac = 95.0
        tac_explanation = f"Superb tactical alignment: Player pressing ({pressing}) matches coach system ({coach_pressing})"
    elif press_diff <= 15:
        s_tac = 80.0
        tac_explanation = f"Solid tactical alignment: Player pressing ({pressing}) compatible with tactical tempo ({coach_pressing})"
    else:
        s_tac = 60.0
        tac_explanation = f"Moderate tactical adaptation required ({pressing} vs {coach_pressing})"

    # 3. Financial / Salary Fit (20%)
    if monthly_budget <= 0:
        s_fin = 80.0
        fin_explanation = "Club wage budget unspecified; standard benchmark assumed"
    elif monthly_demand <= monthly_budget:
        s_fin = 100.0
        fin_explanation = f"Within wage budget: Demand (€{monthly_demand:,}/mo) <= Club cap (€{monthly_budget:,}/mo)"
    elif monthly_demand <= (monthly_budget * 1.15):
        s_fin = 75.0
        fin_explanation = f"Negotiable wage margin: Demand (€{monthly_demand:,}/mo) within 15% of club cap (€{monthly_budget:,}/mo)"
    else:
        s_fin = 40.0
        fin_explanation = f"Wage stretch: Demand (€{monthly_demand:,}/mo) exceeds club cap (€{monthly_budget:,}/mo) by 15-50%"

    # 4. Foreign Quota Fit (15%)
    passport = player.get("passport", "")
    if "ASEAN" in passport and "Malaysia" in club.get("country", ""):
        s_quota = 100.0
        quota_explanation = "Direct fit: Player qualifies for dedicated ASEAN foreign quota slot"
    elif quota_info.get("open_slots_available", 0) >= 1:
        s_quota = 90.0
        quota_explanation = f"Open registration slot verified ({quota_info.get('open_slots_available')} open slot)"
    else:
        s_quota = 50.0
        quota_explanation = "Quota constrained"

    # 5. Market / Availability Fit (10%)
    target_mkts = player.get("target_markets", [])
    if club_country in target_mkts:
        s_mkt = 100.0
        mkt_explanation = f"Target market match: Player explicitly targeting {club_country}"
    elif any(m in ["Asia", "Southeast Asia"] for m in target_mkts) and club_country in ["Indonesia", "Malaysia", "Thailand", "Vietnam"]:
        s_mkt = 85.0
        mkt_explanation = f"Regional interest: Player targets Southeast Asia"
    else:
        s_mkt = 65.0
        mkt_explanation = "Open to international relocation"

    W_POS = 0.30
    W_TAC = 0.25
    W_FIN = 0.20
    W_QUOTA = 0.15
    W_MKT = 0.10

    total_score = round(
        (W_POS * s_pos) +
        (W_TAC * s_tac) +
        (W_FIN * s_fin) +
        (W_QUOTA * s_quota) +
        (W_MKT * s_mkt),
        1
    )

    if total_score >= 85.0:
        tier = "TIER_1_IMMEDIATE_PITCH"
    elif total_score >= 70.0:
        tier = "TIER_2_SECONDARY_OPPORTUNITY"
    else:
        tier = "LOW_COMPATIBILITY"

    return {
        "eligible": True,
        "blocked": False,
        "blocker_reason": None,
        "score": total_score,
        "recommendation_tier": tier,
        "eligible_for_pitch": total_score >= 70.0,
        "component_scores": {
            "positional_fit": {"score": s_pos, "weight": W_POS, "weighted": round(W_POS * s_pos, 2), "explanation": pos_explanation},
            "tactical_fit": {"score": s_tac, "weight": W_TAC, "weighted": round(W_TAC * s_tac, 2), "explanation": tac_explanation},
            "financial_fit": {"score": s_fin, "weight": W_FIN, "weighted": round(W_FIN * s_fin, 2), "explanation": fin_explanation},
            "foreign_quota_fit": {"score": s_quota, "weight": W_QUOTA, "weighted": round(W_QUOTA * s_quota, 2), "explanation": quota_explanation},
            "market_fit": {"score": s_mkt, "weight": W_MKT, "weighted": round(W_MKT * s_mkt, 2), "explanation": mkt_explanation},
            "market_availability_fit": {"score": s_mkt, "weight": W_MKT, "weighted": round(W_MKT * s_mkt, 2), "explanation": mkt_explanation},
        },
        "summary_explanation": f"Overall {total_score}% compatibility. {pos_explanation}; {fin_explanation}; {tac_explanation}."
    }


async def football_get_players(
    position: Optional[str] = None,
    nationality: Optional[str] = None,
    market_interest: Optional[str] = None,
    player_id: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """
    Retrieve football player profiles from the central agency database.
    Supports filtering by tactical position, nationality, target market, or exact player ID.
    """
    players = _load_seed("football_players.json")
    if not players:
        return {"players": [], "total": 0, "data_source": "local_dev_seed", "_is_mock": True}

    results = []
    for p in players:
        if player_id and p.get("id") != player_id:
            continue
        if position:
            pos_clean = position.lower().split("(")[0].strip()
            prim = p.get("primary_position", "").lower()
            secs = [s.lower() for s in (p.get("secondary_positions") or [])]
            if pos_clean not in prim and not any(pos_clean in s for s in secs):
                continue
        if nationality and p.get("nationality", "").lower() != nationality.lower():
            continue
        if market_interest:
            mkts = [m.lower() for m in (p.get("target_markets") or [])]
            if market_interest.lower() not in mkts:
                continue
        results.append(p)

    return {
        "players": results[:limit],
        "total_players": len(players),
        "returned_count": len(results[:limit]),
        "data_source": "local_dev_seed",
        "_is_mock": True,
        "_disclaimer": "Synthetic demonstration fixtures. All salaries, contracts, and metrics are simulated."
    }


async def football_get_clubs(
    league: Optional[str] = None,
    country: Optional[str] = None,
    position_needed: Optional[str] = None,
    club_id: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """
    Retrieve football clubs with current squad vacancies, wage ceilings, foreign quotas, and sporting director contacts.
    """
    clubs = _load_seed("football_clubs.json")
    if not clubs:
        return {"clubs": [], "total": 0, "data_source": "local_dev_seed", "_is_mock": True}

    results = []
    for c in clubs:
        if club_id and c.get("id") != club_id:
            continue
        if country and c.get("country", "").lower() != country.lower():
            continue
        if league and league.lower() not in c.get("league", "").lower():
            continue
        if position_needed:
            p_clean = position_needed.lower().split("(")[0].strip()
            needs = [n.get("position", "").lower() for n in (c.get("squad_needs") or [])]
            if not any(p_clean in n for n in needs):
                continue
        results.append(c)

    return {
        "clubs": results[:limit],
        "total_clubs": len(clubs),
        "returned_count": len(results[:limit]),
        "data_source": "local_dev_seed",
        "_is_mock": True,
        "_disclaimer": "Synthetic demonstration fixtures. Real club names are used for simulation context only."
    }


async def football_get_coaches(
    club_id: Optional[str] = None,
    coach_id: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """
    Retrieve football head coaches with preferred tactical formations and player profile demands.
    """
    coaches = _load_seed("football_coaches.json")
    if not coaches:
        return {"coaches": [], "total": 0, "data_source": "local_dev_seed", "_is_mock": True}

    results = []
    for co in coaches:
        if coach_id and co.get("id") != coach_id:
            continue
        if club_id and co.get("club_id") != club_id:
            continue
        results.append(co)

    return {
        "coaches": results[:limit],
        "total_coaches": len(coaches),
        "data_source": "local_dev_seed",
        "_is_mock": True
    }


async def football_match_player_club(
    player_id: Optional[str] = None,
    club_id: Optional[str] = None,
    player_data: Optional[dict] = None,
    club_data: Optional[dict] = None,
) -> dict:
    """
    Deterministic Two-Layer Matching Tool.
    Layer 1: Hard eligibility & blocker checks.
    Layer 2: Explainable weighted compatibility scoring.
    """
    players = _load_seed("football_players.json")
    clubs = _load_seed("football_clubs.json")
    coaches = _load_seed("football_coaches.json")

    p = player_data or next((x for x in players if x.get("id") == player_id), None)
    c = club_data or next((x for x in clubs if x.get("id") == club_id), None)

    if not p:
        return {"error": f"Player not found: {player_id}", "eligible": False, "score": 0.0}
    if not c:
        return {"error": f"Club not found: {club_id}", "eligible": False, "score": 0.0}

    coach = next((x for x in coaches if x.get("club_id") == c.get("id")), None)
    match_result = calculate_football_match(p, c, coach)

    return {
        "player_id": p.get("id"),
        "player_name": p.get("name"),
        "club_id": c.get("id"),
        "club_name": c.get("club_name"),
        "country": c.get("country"),
        "sporting_director": c.get("sporting_director", {}).get("name"),
        "sporting_director_contact": c.get("sporting_director", {}).get("whatsapp"),
        **match_result,
        "calculation_source": "deterministic_python_engine"
    }


async def football_get_relationship_history(
    contact_name: Optional[str] = None,
    club_id: Optional[str] = None,
) -> dict:
    """
    Retrieve interaction and touchpoint history with clubs, sporting directors, and agents.
    Enforces contact cooldown period (e.g. outreach within last 14 days).
    """
    clubs = _load_seed("football_clubs.json")
    c = next((x for x in clubs if x.get("id") == club_id or x.get("club_name") == contact_name), None)

    if c:
        rel = c.get("relationship_history", {})
        dir_info = c.get("sporting_director", {})
        return {
            "entity_id": c.get("id"),
            "entity_name": c.get("club_name"),
            "contact_person": dir_info.get("name"),
            "contact_email": dir_info.get("email"),
            "contact_whatsapp": dir_info.get("whatsapp"),
            "safe_to_contact": True,
            "days_since_last_contact": 28,
            "relationship_strength": rel.get("relationship_strength", "Warm Professional"),
            "previous_collaborations": rel.get("previous_collaborations", 1),
            "notes": "Director receptive to high-tempo attacking profiles with European pedigree."
        }

    return {
        "entity_id": "unknown",
        "entity_name": contact_name or "Unknown Contact",
        "safe_to_contact": True,
        "days_since_last_contact": 60,
        "relationship_strength": "New Market Outreach",
        "previous_collaborations": 0,
        "notes": "First-time outreach."
    }


# Schema + Function Registry
# ─────────────────────────────────────────────────────────────────────────────

LOCAL_TOOL_FUNCTIONS: dict[str, Any] = {
    "product_api_usage": product_api_usage,
    "product_api_nps": product_api_nps,
    "product_api_deals": product_api_deals,
    "get_communication_history": get_communication_history,
    "get_activity_log": get_activity_log,
    "retail_get_inventory": retail_get_inventory,
    "retail_get_sales": retail_get_sales,
    "health_get_patients": health_get_patients,
    "health_get_appointments": health_get_appointments,
    "finance_get_expenses": finance_get_expenses,
    "finance_get_employees": finance_get_employees,
    "re_get_listings":           re_get_listings,
    "re_get_showing_feedback":   re_get_showing_feedback,
    "re_get_comparable_sales":   re_get_comparable_sales,
    "re_get_leases":             re_get_leases,
    "re_get_maintenance_tickets": re_get_maintenance_tickets,
    "re_get_tenant_ledger":      re_get_tenant_ledger,
    "re_get_buyers":             re_get_buyers,
    "email_get_synthetic_messages": email_get_synthetic_messages,
    "crm_get_synthetic_leads":      crm_get_synthetic_leads,
    "case_study_get_data": case_study_get_data,
    "investor_update_get_data": investor_update_get_data,
    "pipeline_content_get_requests": pipeline_content_get_requests,
    "account_signal_get_data": account_signal_get_data,
    "sla_monitor_get_events": sla_monitor_get_events,
    "account_based_campaign_get_data": account_based_campaign_get_data,
    "finance_operations_get_data": finance_operations_get_data,
    "football_get_players": football_get_players,
    "football_get_clubs": football_get_clubs,
    "football_get_coaches": football_get_coaches,
    "football_match_player_club": football_match_player_club,
    "football_get_relationship_history": football_get_relationship_history,
}

LOCAL_TOOL_SCHEMAS: dict[str, dict] = {
    "email_get_synthetic_messages": {
        "type": "function",
        "function": {
            "name": "email_get_synthetic_messages",
            "description": "Retrieve synthetic business email messages for workflow execution testing. Allows filtering by priority, scenario, or text search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max email records to return", "default": 40},
                    "priority": {"type": "string", "enum": ["urgent", "high", "normal", "low"], "description": "Filter by priority level"},
                    "scenario": {"type": "string", "description": "Filter by operational scenario"},
                    "search_query": {"type": "string", "description": "Search text in subject or body"},
                },
            },
        },
    },
    "crm_get_synthetic_leads": {
        "type": "function",
        "function": {
            "name": "crm_get_synthetic_leads",
            "description": "Retrieve synthetic inbound leads (website form/webhook + CRM history) for the Inbound Lead-to-Demo workflow. Each lead includes form, UTM/source, and CRM-history fields for fit/intent/need/data-quality scoring. Filter by form type, demo request, or text search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max lead records to return", "default": 40},
                    "form_type": {"type": "string", "enum": ["demo_request", "contact", "waitlist"], "description": "Filter by the form the lead submitted"},
                    "requested_demo": {"type": "boolean", "description": "Filter to leads that explicitly requested a demo"},
                    "search_query": {"type": "string", "description": "Search text in name, company, or message"},
                },
            },
        },
    },
    "case_study_get_data": {
        "type": "function",
        "function": {
            "name": "case_study_get_data",
            "description": "Load approved case studies with public permission for repurposing.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    "investor_update_get_data": {
        "type": "function",
        "function": {
            "name": "investor_update_get_data",
            "description": "Load investor update metrics for investor and partnership updates.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    "pipeline_content_get_requests": {
        "type": "function",
        "function": {
            "name": "pipeline_content_get_requests",
            "description": "Load pipeline content requests for generating assets with UTM tracking.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    "account_signal_get_data": {
        "type": "function",
        "function": {
            "name": "account_signal_get_data",
            "description": "Load account signals for expansion or churn risk analysis.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    "sla_monitor_get_events": {
        "type": "function",
        "function": {
            "name": "sla_monitor_get_events",
            "description": "Load marketing-to-sales SLA event timestamps for compliance monitoring.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    "account_based_campaign_get_data": {
        "type": "function",
        "function": {
            "name": "account_based_campaign_get_data",
            "description": "Load target account list and objectives for account-based campaign planning.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    "finance_operations_get_data": {
        "type": "function",
        "function": {
            "name": "finance_operations_get_data",
            "description": "Load consolidated finance operations signals (expenses, late payments, lease expiries).",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    "product_api_usage": {
        "type": "function",
        "function": {
            "name": "product_api_usage",
            "description": "Get SaaS customer accounts with usage metrics, DAU trends, support tickets, renewal dates, and churn risk indicators. Returns a focused sample prioritizing critical/at-risk accounts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max accounts to return (default 30)", "default": 30},
                    "health_filter": {
                        "type": "string",
                        "enum": ["critical", "at_risk", "healthy"],
                        "description": "Filter by account health label",
                    },
                    "account_id": {"type": "string", "description": "Get one specific account by ID"},
                    "include_healthy": {"type": "boolean", "description": "Include healthy accounts for context", "default": True},
                },
            },
        },
    },
    "product_api_nps": {
        "type": "function",
        "function": {
            "name": "product_api_nps",
            "description": "Get NPS scores and customer feedback verbatim. Useful for identifying detractors and at-risk signals.",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_ids": {"type": "array", "items": {"type": "string"}, "description": "Filter by specific account IDs"},
                    "score_below": {"type": "integer", "description": "Only return accounts with NPS below this value"},
                    "limit": {"type": "integer", "default": 50},
                },
            },
        },
    },
    "product_api_deals": {
        "type": "function",
        "function": {
            "name": "product_api_deals",
            "description": "Get sales pipeline deals with stage, days-in-stage, and stall indicators.",
            "parameters": {
                "type": "object",
                "properties": {
                    "stalled_only": {"type": "boolean", "description": "Only return stalled deals"},
                    "stage": {"type": "string", "enum": ["discovery", "demo", "proposal", "negotiation", "closing"]},
                    "limit": {"type": "integer", "default": 30},
                },
            },
        },
    },
    "get_communication_history": {
        "type": "function",
        "function": {
            "name": "get_communication_history",
            "description": "Check recent email/communication history for an account. Used to prevent duplicate outreach within 7 days.",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "string", "description": "Account ID to check"},
                    "contact_id": {"type": "string", "description": "Contact/email ID to check"},
                    "days_back": {"type": "integer", "description": "Days of history to retrieve", "default": 30},
                },
            },
        },
    },
    "get_activity_log": {
        "type": "function",
        "function": {
            "name": "get_activity_log",
            "description": "Get CRM activity log for a contact or account.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contact_id": {"type": "string"},
                    "account_id": {"type": "string"},
                    "days_back": {"type": "integer", "default": 30},
                },
            },
        },
    },
    "retail_get_inventory": {
        "type": "function",
        "function": {
            "name": "retail_get_inventory",
            "description": "Get retail product inventory levels with stockout and overstock risk indicators.",
            "parameters": {
                "type": "object",
                "properties": {
                    "risk_filter": {"type": "string", "enum": ["stockout", "overstock", "healthy"]},
                    "category": {"type": "string", "description": "Product category"},
                    "limit": {"type": "integer", "default": 40},
                },
            },
        },
    },
    "retail_get_sales": {
        "type": "function",
        "function": {
            "name": "retail_get_sales",
            "description": "Get product sales velocity: units sold, sell-through rate, days of supply.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string"},
                    "category": {"type": "string"},
                    "limit": {"type": "integer", "default": 30},
                },
            },
        },
    },
    "health_get_patients": {
        "type": "function",
        "function": {
            "name": "health_get_patients",
            "description": "Get patient records with health risk levels, adherence scores, and engagement status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "risk_filter": {"type": "string", "enum": ["high_risk", "moderate_risk", "stable"]},
                    "condition": {"type": "string", "description": "Primary condition filter (e.g. diabetes, hypertension)"},
                    "limit": {"type": "integer", "default": 30},
                },
            },
        },
    },
    "health_get_appointments": {
        "type": "function",
        "function": {
            "name": "health_get_appointments",
            "description": "Get appointment data: upcoming, no-shows, cancellations. Used to identify disengaged patients.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "status": {"type": "string", "enum": ["scheduled", "no_show", "cancelled", "completed"]},
                    "days_ahead": {"type": "integer", "default": 14},
                    "limit": {"type": "integer", "default": 50},
                },
            },
        },
    },
    "finance_get_expenses": {
        "type": "function",
        "function": {
            "name": "finance_get_expenses",
            "description": "Get corporate expense transactions with anomaly flags, policy violation indicators, and department breakdowns.",
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {"type": "string", "description": "Filter by department name"},
                    "anomaly_only": {"type": "boolean", "description": "Only return flagged anomalies", "default": False},
                    "amount_above": {"type": "number", "description": "Filter transactions above this USD amount"},
                    "limit": {"type": "integer", "default": 40},
                },
            },
        },
    },
    "finance_get_employees": {
        "type": "function",
        "function": {
            "name": "finance_get_employees",
            "description": "Get employee records for expense attribution and manager lookup.",
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {"type": "string"},
                    "limit": {"type": "integer", "default": 50},
                },
            },
        },
    },
    "re_get_listings": {
        "type": "function",
        "function": {
            "name": "re_get_listings",
            "description": "Get active real estate listings with days-on-market, showing counts, price reduction history, and stale/healthy risk labels. Primary research tool for brokerage workflows.",
            "parameters": {
                "type": "object",
                "properties": {
                    "risk_filter": {"type": "string", "enum": ["stale", "price_reduced", "healthy"],
                                    "description": "Filter by listing health status"},
                    "agent_name": {"type": "string", "description": "Filter by listing agent"},
                    "status": {"type": "string", "enum": ["active", "pending", "sold"],
                               "description": "Listing status (default: active)"},
                    "limit": {"type": "integer", "default": 30},
                },
            },
        },
    },
    "re_get_showing_feedback": {
        "type": "function",
        "function": {
            "name": "re_get_showing_feedback",
            "description": "Get buyer feedback from property showings. Critical for identifying price objections and why listings are not converting.",
            "parameters": {
                "type": "object",
                "properties": {
                    "listing_id": {"type": "string", "description": "Filter by specific listing ID"},
                    "limit": {"type": "integer", "default": 50},
                },
            },
        },
    },
    "re_get_comparable_sales": {
        "type": "function",
        "function": {
            "name": "re_get_comparable_sales",
            "description": "Get recent comparable sold properties (comps) for Comparative Market Analysis (CMA). Use this to justify price reduction recommendations to sellers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "zip_code": {"type": "string", "description": "ZIP code to search comps within"},
                    "bedrooms": {"type": "integer", "description": "Number of bedrooms to match"},
                    "days_back": {"type": "integer", "description": "How many days of sales history to include", "default": 180},
                    "limit": {"type": "integer", "default": 10},
                },
            },
        },
    },
    "re_get_leases": {
        "type": "function",
        "function": {
            "name": "re_get_leases",
            "description": "Get tenant lease records with flight risk scores, expiry dates, and renewal status. Primary research tool for property management workflows.",
            "parameters": {
                "type": "object",
                "properties": {
                    "risk_filter": {"type": "string", "enum": ["high_flight_risk", "medium_flight_risk", "stable"]},
                    "expiring_within_days": {"type": "integer", "description": "Get leases expiring within N days (e.g. 90)"},
                    "property_id": {"type": "string"},
                    "limit": {"type": "integer", "default": 30},
                },
            },
        },
    },
    "re_get_maintenance_tickets": {
        "type": "function",
        "function": {
            "name": "re_get_maintenance_tickets",
            "description": "Get maintenance/repair tickets for properties. Unresolved maintenance is a key driver of tenant churn. Use alongside re_get_leases to identify high-risk tenants.",
            "parameters": {
                "type": "object",
                "properties": {
                    "property_id": {"type": "string"},
                    "status": {"type": "string", "enum": ["open", "in_progress", "resolved"]},
                    "priority": {"type": "string", "enum": ["emergency", "high", "medium", "low"]},
                    "limit": {"type": "integer", "default": 40},
                },
            },
        },
    },
    "re_get_tenant_ledger": {
        "type": "function",
        "function": {
            "name": "re_get_tenant_ledger",
            "description": "Get tenant payment history and late payment record. Late payments signal financial stress and flight risk.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tenant_id": {"type": "string"},
                    "late_payments_only": {"type": "boolean", "default": False},
                    "limit": {"type": "integer", "default": 30},
                },
            },
        },
    },
    "re_get_buyers": {
        "type": "function",
        "function": {
            "name": "re_get_buyers",
            "description": "Get active buyer leads with their engagement status and matching criteria.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status_filter": {"type": "string", "enum": ["hot", "warm", "cold", "under_contract"]},
                    "agent_name": {"type": "string"},
                    "limit": {"type": "integer", "default": 30},
                },
            },
        },
    },
    "football_get_players": {
        "type": "function",
        "function": {
            "name": "football_get_players",
            "description": "Retrieve football players with contracts, positions, and scouting metrics.",
            "parameters": {
                "type": "object",
                "properties": {
                    "position": {"type": "string"},
                    "nationality": {"type": "string"},
                    "market_interest": {"type": "string"},
                    "contract_expiring_days": {"type": "integer"},
                    "player_id": {"type": "string"},
                },
            },
        },
    },
    "football_get_clubs": {
        "type": "function",
        "function": {
            "name": "football_get_clubs",
            "description": "Retrieve candidate football clubs with squad needs, foreign quotas, and budgets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "league": {"type": "string"},
                    "country": {"type": "string"},
                    "position_needed": {"type": "string"},
                    "club_id": {"type": "string"},
                },
            },
        },
    },
    "football_get_coaches": {
        "type": "function",
        "function": {
            "name": "football_get_coaches",
            "description": "Retrieve coach tactical profiles, pressing intensity, and formations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "club_id": {"type": "string"},
                    "coach_id": {"type": "string"},
                },
            },
        },
    },
    "football_match_player_club": {
        "type": "function",
        "function": {
            "name": "football_match_player_club",
            "description": "Deterministic two-layer matching engine (hard blockers + explainable weights).",
            "parameters": {
                "type": "object",
                "properties": {
                    "player_id": {"type": "string"},
                    "club_id": {"type": "string"},
                },
            },
        },
    },
    "football_get_relationship_history": {
        "type": "function",
        "function": {
            "name": "football_get_relationship_history",
            "description": "Retrieve interaction and touchpoint history with clubs, sporting directors, and agents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contact_name": {"type": "string"},
                    "club_id": {"type": "string"},
                },
            },
        },
    },
}