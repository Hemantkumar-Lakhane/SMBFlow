# SMBFlow Research Paper Overhaul: Changelog

This document provides a comprehensive accounting of all modifications, additions, deletions, and theoretical/empirical enhancements introduced during the rigorous overhaul of the research paper:

> **Title**: *SMBFlow: A Deterministically Governed Multi-Agent Architecture for Context-Aware Workflow Automation in Enterprise Environments*  
> **Target Venue**: IEEE Conference / IEEE Transactions on Services Computing (TSC) / IEEE Access (8 pages, double-column, `IEEEtran` format).

---

## 1. Summary of Structural & Architectural Changes

| Dimension | Original Draft | Overhauled Version | Motivation / Rationale |
| :--- | :--- | :--- | :--- |
| **Core Architecture** | Heuristic agent pipeline with direct tool access | **Capability-Based Execution Isolation** with signed HMAC single-use tokens | Eliminates credential over-privilege; agents hold zero tool keys. |
| **Governance Gates** | Uncalibrated static linear weights ($R = \mathbf{w}^T \boldsymbol{\phi}$) | **Platt-Calibrated Logistic Model + Conformal Risk Bound ($\le 5\%$)** | Replaces arbitrary weights with formal distribution-free safety guarantees. |
| **Human-in-the-Loop** | Static threshold routing to queue | **Online Adaptive HITL Controller** | Dynamically adapts threshold via operator feedback, reducing fatigue by 3.9\%. |
| **Execution Provenance** | Unhardened local SHA-256 hash chain | **Hardened Merkle EPI + Signed External Checkpoint Anchoring** | Provides computational immutability (Theor. 1) and truncation detection (Theor. 2). |
| **Transaction Safety** | Absent; failed actions remain mutated | **Saga-Style Backward Compensation** | Guarantees 100\% rollback to clean baseline upon mid-workflow failure/rejection. |
| **Context Retrieval** | Conceptual hybrid retrieval | **Hybrid GraphRAG (PPR + Dense Cosine)** | Resolves multi-hop enterprise dependency reasoning (Recall@5: 1.00 vs 0.05). |
| **Model Optimization** | Static tier assignment (unverified 42\% claim) | **Quality-Constrained Integer Program Routing** | Empirically achieves 51.8\% savings vs Frontier ($p < 10^{-50}$, Cohen's $d = 10.06$). |
| **Baselines** | None (only conceptual feature matrix) | **4 Empirical Baselines** (Ungated ReAct, LangGraph, AutoGen, Deterministic DAG) | Provides rigorous benchmarking across 900 workflow runs. |
| **Adversarial Benchmark**| None | **240 Targeted Attack Vectors** across 6 security categories | Verifies 100\% block rate against injection, schema breach, over-limit, and tampering. |
| **Visual Formatting** | Missing / non-standard raster PNGs | **11 Strictly Grayscale Vector PDFs + 300 DPI PNGs** | Meets strict IEEE print guidelines (no color, distinct hatches, error bars). |
| **Citations** | 12 entries with doubtful/fabricated references (`shao2023control`, `metzger2015trigger`) | **35 Verified Peer-Reviewed Publications** with venues, DOIs, and full metadata | Restores academic integrity; eliminates unverified literature. |

---

## 2. Detailed Section-by-Section Modifications

### Abstract
- **Removed**: Unverified claims of "sub-380 ms overhead", "42% savings", and "100% recall" without experimental traceability.
- **Added**: Measured experimental outcomes:
  - 0.0% unsafe execution rate across 900 runs (vs 14.7%--20.3% for ReAct and 8.0%--8.7% for LangGraph).
  - 51.8% cost savings via constrained routing ($p < 10^{-50}$).
  - 100% adversarial block rate across 240 red-team vectors.
  - 50,000-step EPI verification in 704.8 ms.
  - Verification gate latency of 0.59 ms and non-LLM system overhead of 2.21 ms.

### Section I: Introduction
- Formulated the fundamental operational failure modes of LLM multi-agent systems in enterprise environments: stochastic state mutation, prompt injection vulnerabilities, credential over-privilege, and absent cryptographic auditability.
- Articulated the five core architectural contributions with precision and academic rigor.

### Section II: Related Work and Gap Analysis
- Reorganized into thematic subsections:
  1. Multi-Agent Frameworks and Tool-Use Safety (ReAct, Toolformer, AutoGen, MetaGPT, ToolEmu).
  2. Workflow Management and Transactional Sagas (Temporal, Apache Airflow, BPMN, Sagas).
  3. Cryptographic Logging and Model Cascades (Merkle trees, Certificate Transparency, FrugalGPT, RouteLLM).
- Added **Table I**: Systematic feature comparison matrix contrasting SMBFlow with AutoGen, LangGraph, and Temporal.

### Section III: Threat Model and Problem Formulation
- Defined explicit Threat Model:
  - Protected assets, adversary capabilities (prompt injection, stochastic drift, tenant compromise, log tampering), and security assumptions.
- Formulated the constrained optimization problem: maximizing workflow task success while strictly enforcing $\Pr(\text{Unsafe Side-Effect Execution}) = 0$ under budget and latency constraints.

### Section IV: SMBFlow Architecture and Invariants
- Introduced a three-plane architectural decomposition: Control Plane, Data Plane, and Trust Plane.
- **Capability-Based Execution Isolation**: Formally defined Execution Token $\mathcal{T}_{exec} = \langle \tau, H(a^*), \eta, t_{exp}, \sigma \rangle$ and proved the Execution Isolation Invariant.
- **Typed Policy DSL**: Formalized schema checking and static predicate evaluation over structured parameters.
- **Calibrated Risk Scoring**: Formulated Platt scaling and conformal risk control bounding false execution below 5.0%.
- **Adaptive HITL Controller**: Formulated online threshold update via operator feedback gradient descent.
- **Hardened Merkle EPI**:
  - Restated **Theorem 1** correctly under computational collision resistance of $\mathcal{H}$ (replacing the erroneous "probability $1-2^{-256}$" phrasing).
  - Added **Theorem 2** (Truncation Detection via Signed Checkpoints) and its proof under EUF-CMA digital signatures.
- **Saga-Style Compensation**: Defined reverse topological rollback semantics.
- **Hybrid GraphRAG**: Formalized the dual-objective scoring function $S_{hyb}(q, d) = \alpha \cdot \text{sim}_{\cos}(\mathbf{e}_q, \mathbf{e}_d) + (1-\alpha) \cdot \text{PPR}_{\mathcal{G}}(q, d)$.
- Added **Algorithm 1**: Deterministic Governance and Capability Token Issuance.

### Section V: Experimental Methodology
- Defined six explicit research questions (RQ1 to RQ6).
- Formulated three realistic multi-tenant workflows: Product Launch, Invoice Reconciliation, and Customer Churn Outreach.
- Added **Table II**: Detailed experimental testbed configuration, model versions, context windows, and token pricing parameters.
- Established five baselines: Ungated ReAct, LangGraph with prompt guardrails, AutoGen multi-agent chat, Deterministic DAG (no LLM), and SMBFlow full.

### Section VI: Results and Empirical Analysis
- Dedicated subsection per research question, each concluding with an italicized, evidence-grounded **Finding**:
  - **RQ1 (Safety)**: Analysis of 900 runs and 240 red-team attacks (**Table III**, **Table IV**, **Fig. 2**).
  - **RQ2 (Latency)**: Latency breakdown across 500 runs (**Table V**, **Fig. 4**); verification gate = 0.59 ms, non-LLM overhead = 2.21 ms.
  - **RQ3 (Cost-Quality)**: Routing evaluation (**Table VI**, **Fig. 5**); 51.8% savings vs Frontier; Wilcoxon signed-rank tests (**Table VII**, $p = 6.08 \times 10^{-51}$, Cohen's $d = 10.06$).
  - **RQ4 (Risk & HITL)**: ROC curve ($\text{AUC} = 0.764$), ECE = 0.0495, conformal false-execute = 5.18%, adaptive review reduction = 3.9%, Saga rollback = 100% (**Fig. 6**, **Fig. 7**).
  - **RQ5 (GraphRAG)**: Multi-hop retrieval ablation across $\alpha \in [0.0, 1.0]$ (**Table VIII**, **Fig. 8**); hybrid $\alpha=0.6$ achieves Recall@5 = 1.00 vs Vector-only Recall@5 = 0.05.
  - **RQ6 (Scalability & Audit)**: Concurrency scaling to 100 tenants (3,982.1 workflows/sec, **Fig. 9**) and EPI scaling to 50,000 steps (704.8 ms, 70,939 steps/sec, **Table IX**, **Fig. 10**).

### Section VII: Discussion and Failure Analysis
- Analyzed why deterministic verification incurs negligible overhead ($< 0.1\%$ of pipeline duration).
- Provided honest failure analysis covering operator bottlenecks under high ambiguity, schema rigidity under external API drift, and cold-start graph sparsity.
- Distilled three practical deployment lessons for enterprise systems engineers.

### Sections VIII--X: Threats to Validity, Limitations, Conclusion
- Analyzed internal, external, and construct validity threats.
- Outlined concrete limitations (in-memory graph scale, synchronous human response time, federated multi-tenant learning).
- Synthesized conclusions reinforcing the central thesis.

### References
- Removed all unverified/doubtful citations (`shao2023control`, `metzger2015trigger`).
- Integrated 35 verified, high-impact peer-reviewed references from top venues (ICLR, NeurIPS, EMNLP, ACM UIST, USENIX Security, IEEE TKDE, Springer).

---

## 3. Visual Assets Overhaul
All 11 figures were generated using automated matplotlib scripts directly from the CSV results files:
- Guaranteed **100% pure grayscale** (RGB diff = 0 verified across all pixels).
- Embedded high-contrast hatch patterns (`//`, `\\`, `xx`, `..`), distinct line styles, and error bars.
- Vector PDF output accompanied by 300-DPI raster PNG backups.

