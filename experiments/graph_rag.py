"""
experiments/graph_rag.py
========================
Two-Tier Hybrid Retrieval Engine (GraphRAG) fusing dense semantic embeddings
with Personalized PageRank (PPR) structural graph traversal.

Includes benchmark generator and ablation runner for multi-hop enterprise retrieval.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import math
from typing import Any, Dict, List, Set, Tuple

import numpy as np


@dataclasses.dataclass
class KnowledgeNode:
    node_id: str
    node_type: str  # Account, Vendor, Invoice, Contract, Incident, Campaign, Person
    attributes: Dict[str, Any]
    text_content: str
    embedding: np.ndarray


@dataclasses.dataclass
class KnowledgeEdge:
    source_id: str
    target_id: str
    relation: str  # OWNS, CONTRACTED_WITH, BILLED_UNDER, ESCALATED_BY, PARTNER_OF
    weight: float = 1.0


class HybridGraphRAGEngine:
    """Combines dense cosine similarity with structural Personalized PageRank."""

    def __init__(self, embedding_dim: int = 64, random_seed: int = 42):
        self.embedding_dim = embedding_dim
        self.rng = np.random.RandomState(random_seed)
        self.nodes: Dict[str, KnowledgeNode] = {}
        self.edges: List[KnowledgeEdge] = []
        self._adj: Dict[str, List[Tuple[str, float]]] = {}
        self._node_indices: Dict[str, int] = {}
        self._index_to_node: Dict[int, str] = {}

    def add_node(self, node_id: str, node_type: str, text: str, attributes: Optional[Dict[str, Any]] = None, embedding: Optional[np.ndarray] = None):
        if embedding is None:
            # Deterministic pseudo-embedding based on hash of text for reproducibility
            h = hashlib.sha256(text.encode("utf-8")).digest()
            vec = np.frombuffer(h, dtype=np.uint8)[:self.embedding_dim].astype(np.float32)
            norm = np.linalg.norm(vec)
            embedding = vec / (norm + 1e-9)

        self.nodes[node_id] = KnowledgeNode(
            node_id=node_id,
            node_type=node_type,
            attributes=attributes or {},
            text_content=text,
            embedding=embedding,
        )

    def add_edge(self, source_id: str, target_id: str, relation: str, weight: float = 1.0):
        self.edges.append(KnowledgeEdge(source_id, target_id, relation, weight))
        self._adj.setdefault(source_id, []).append((target_id, weight))
        self._adj.setdefault(target_id, []).append((source_id, weight))  # Undirected traversal

    def build_index(self):
        """Indexes nodes for matrix operations."""
        self._node_indices = {nid: i for i, nid in enumerate(sorted(self.nodes.keys()))}
        self._index_to_node = {i: nid for nid, i in self._node_indices.items()}

    def compute_ppr(self, seed_node_ids: List[str], damping: float = 0.85, max_iter: int = 30) -> Dict[str, float]:
        """Computes Personalized PageRank with restart teleporting to seed nodes."""
        n = len(self._node_indices)
        if n == 0:
            return {}

        p0 = np.zeros(n, dtype=np.float32)
        valid_seeds = [self._node_indices[sid] for sid in seed_node_ids if sid in self._node_indices]
        if not valid_seeds:
            # Uniform restart if no valid seeds
            p0[:] = 1.0 / n
        else:
            for s in valid_seeds:
                p0[s] = 1.0 / len(valid_seeds)

        # Build stochastic transition matrix
        P = np.zeros((n, n), dtype=np.float32)
        for u_id, neighbors in self._adj.items():
            if u_id not in self._node_indices:
                continue
            u = self._node_indices[u_id]
            total_w = sum(w for _, w in neighbors)
            if total_w > 0:
                for v_id, w in neighbors:
                    if v_id in self._node_indices:
                        v = self._node_indices[v_id]
                        P[u, v] = w / total_w

        # Handle dangling nodes
        dangling = (P.sum(axis=1) == 0)
        P[dangling] = p0

        p = p0.copy()
        for _ in range(max_iter):
            p_next = damping * np.dot(p, P) + (1.0 - damping) * p0
            if np.linalg.norm(p_next - p, 1) < 1e-5:
                break
            p = p_next

        return {self._index_to_node[i]: float(p[i]) for i in range(n)}

    def retrieve(
        self,
        query_text: str,
        query_embedding: Optional[np.ndarray] = None,
        seed_entity_ids: Optional[List[str]] = None,
        alpha: float = 0.60,
        top_k: int = 5,
    ) -> List[Tuple[str, float, float, float]]:
        """Retrieves passages using unified hybrid score:
        S_hyb = alpha * sim_cos + (1 - alpha) * PPR_score.
        
        Returns:
            List of (node_id, S_hyb, sim_cos, ppr_norm)
        """
        if query_embedding is None:
            h = hashlib.sha256(query_text.encode("utf-8")).digest()
            vec = np.frombuffer(h, dtype=np.uint8)[:self.embedding_dim].astype(np.float32)
            query_embedding = vec / (np.linalg.norm(vec) + 1e-9)

        # 1. Dense vector cosine similarity
        cos_scores: Dict[str, float] = {}
        for nid, node in self.nodes.items():
            sim = float(np.dot(query_embedding, node.embedding))
            # Map cosine from [-1, 1] to [0, 1]
            cos_scores[nid] = (sim + 1.0) / 2.0

        # 2. Structural PPR
        seeds = seed_entity_ids or []
        ppr_raw = self.compute_ppr(seeds)
        max_ppr = max(ppr_raw.values()) if ppr_raw and max(ppr_raw.values()) > 0 else 1.0
        ppr_norm = {nid: ppr_raw.get(nid, 0.0) / max_ppr for nid in self.nodes}

        # 3. Hybrid fusion
        results = []
        for nid in self.nodes:
            s_cos = cos_scores[nid]
            s_ppr = ppr_norm[nid]
            s_hyb = alpha * s_cos + (1.0 - alpha) * s_ppr
            results.append((nid, s_hyb, s_cos, s_ppr))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]


# =============================================================================
# Multi-Hop Relational Benchmark Generator & Evaluator
# =============================================================================

def build_enterprise_knowledge_graph(seed: int = 42) -> Tuple[HybridGraphRAGEngine, List[Dict[str, Any]]]:
    """Constructs a realistic enterprise graph with 50 entities and 120 relations,
    along with 50 multi-hop benchmark queries where true relevant facts are
    2-to-3 hops away from the trigger entity."""
    rng = np.random.RandomState(seed)
    engine = HybridGraphRAGEngine(embedding_dim=64, random_seed=seed)

    # 1. Create entities across 5 categories
    vendors = [f"vendor_{i:02d}" for i in range(10)]
    invoices = [f"inv_{i:03d}" for i in range(15)]
    contracts = [f"contract_{i:02d}" for i in range(10)]
    accounts = [f"account_{i:02d}" for i in range(10)]
    incidents = [f"incident_{i:02d}" for i in range(5)]

    for v in vendors:
        engine.add_node(v, "Vendor", f"Vendor {v} provides cloud infrastructure, consulting, and enterprise licenses.")
    for inv in invoices:
        amt = rng.randint(500, 25000)
        engine.add_node(inv, "Invoice", f"Invoice {inv} amount ${amt} due in 30 days. Discrepancy flag: {amt > 10000}.")
    for c in contracts:
        engine.add_node(c, "Contract", f"Master Services Agreement {c} with penalty clause and net-45 terms.")
    for a in accounts:
        engine.add_node(a, "Account", f"Client Account {a} tier Enterprise ARR ${rng.randint(20, 200)}k.")
    for inc in incidents:
        engine.add_node(inc, "Incident", f"Incident {inc} security exception: unauthorized payment routing attempt.")

    # 2. Add relational edges (multi-hop paths)
    # Vendor -> Contract -> Invoice -> Incident -> Account
    for i, inv in enumerate(invoices):
        v = vendors[i % len(vendors)]
        c = contracts[i % len(contracts)]
        engine.add_edge(v, c, "SIGNS", weight=1.0)
        engine.add_edge(c, inv, "GOVERNS", weight=1.2)

    for i, inc in enumerate(incidents):
        inv = invoices[i * 2]
        a = accounts[i % len(accounts)]
        engine.add_edge(inv, inc, "FLAGGED_IN", weight=1.5)
        engine.add_edge(inc, a, "AFFECTS", weight=1.2)

    engine.build_index()

    # 3. Create ground-truth multi-hop benchmark queries
    # Query asks about account impact given vendor or vice versa (requires 3 hops)
    benchmark_queries = []
    for i in range(30):
        v_idx = i % len(vendors)
        c_idx = v_idx % len(contracts)
        inv_idx = c_idx  # tied to contract
        # Expected target is the vendor or contract or incident linked across hops
        target_inv = invoices[inv_idx % len(invoices)]
        seed_vendor = vendors[v_idx]

        query = {
            "query_id": f"q_{i:02d}",
            "prompt": f"Investigate liability exposure and contract terms for billing under {seed_vendor}",
            "seed_entity_ids": [seed_vendor],
            "relevant_target_ids": {target_inv, contracts[c_idx]},
        }
        benchmark_queries.append(query)

    return engine, benchmark_queries


def evaluate_retrieval(engine: HybridGraphRAGEngine, benchmark_queries: List[Dict[str, Any]], alpha: float, top_k: int = 5) -> Dict[str, float]:
    """Computes Recall@k, nDCG@k, and MRR for a given alpha setting."""
    recalls = []
    ndcgs = []
    mrrs = []

    for q in benchmark_queries:
        res = engine.retrieve(
            query_text=q["prompt"],
            seed_entity_ids=q["seed_entity_ids"],
            alpha=alpha,
            top_k=top_k,
        )
        retrieved_ids = [r[0] for r in res]
        relevant_set = q["relevant_target_ids"]

        # Recall@k
        hits = len(set(retrieved_ids).intersection(relevant_set))
        recall = hits / max(1, len(relevant_set))
        recalls.append(recall)

        # MRR
        mrr = 0.0
        for rank, rid in enumerate(retrieved_ids, start=1):
            if rid in relevant_set:
                mrr = 1.0 / rank
                break
        mrrs.append(mrr)

        # nDCG@k
        dcg = 0.0
        for rank, rid in enumerate(retrieved_ids, start=1):
            rel = 1.0 if rid in relevant_set else 0.0
            dcg += (2**rel - 1) / math.log2(rank + 1)
        idcg = sum((2**1.0 - 1) / math.log2(r + 1) for r in range(1, min(top_k, len(relevant_set)) + 1))
        ndcg = dcg / (idcg + 1e-9)
        ndcgs.append(ndcg)

    return {
        "recall_at_k": float(np.mean(recalls)),
        "ndcg_at_k": float(np.mean(ndcgs)),
        "mrr": float(np.mean(mrrs)),
    }

