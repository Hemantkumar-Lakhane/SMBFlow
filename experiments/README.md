# SMBFlow Experimental Benchmark Suite & Reproduction Guide

This directory contains the complete source code, benchmark suites, mathematical models, and figure generation scripts supporting the paper:

> **SMBFlow: A Deterministically Governed Multi-Agent Architecture for Context-Aware Workflow Automation in Enterprise Environments**

---

## 1. Directory Structure

```
experiments/
├── governance_engine.py      # Core governance implementation: Capability Token Issuer,
│                             # Typed Policy Engine, Platt-Calibrated Risk Scorer,
│                             # Adaptive HITL Controller, Hardened Merkle EPI, and Saga Compensation
├── graph_rag.py              # Two-tier Hybrid GraphRAG context retrieval (PPR + dense cosine)
├── router.py                 # Quality-constrained dynamic model routing and token optimization
├── run_all_experiments.py    # Master experimental runner (900 runs, 240 red-team attacks, etc.)
├── generate_figures.py       # Publication-grade grayscale data figure generation (matplotlib)
├── generate_diagrams.py      # Publication-grade grayscale architecture & flow diagrams
├── reproduce.py              # Single-command end-to-end reproduction script
└── README.md                 # This documentation file

results/
├── summary_metrics.json      # Key aggregated findings and execution metadata
├── main_results.csv          # 900 runs across 3 workflows and 5 baseline architectures
├── adversarial_results.csv   # 240 red-team attacks across 6 security categories
├── latency_breakdown.csv     # Stage-by-stage latency percentiles (p50, p95, p99) and 95% CIs
├── routing_comparison.csv    # Inference expenditure and quality trade-offs across model tiers
├── risk_calibration.csv      # ROC-AUC, Brier score, ECE, and conformal threshold bounds
├── hitl_adaptive.csv         # 300 sequential operator decision steps and threshold dynamics
├── graphrag_ablation.csv     # Multi-hop retrieval ablation across alpha in [0.0, 1.0]
├── scalability_benchmark.csv # Throughput and latency scaling under 1 to 100 concurrent tenants
├── epi_benchmark.csv         # Hardened Merkle-chain verification time and storage up to 50k steps
├── statistical_tests.csv     # Wilcoxon signed-rank tests and Cohen's d effect sizes
└── raw_logs/
    └── workflow_execution_traces.jsonl  # Raw step-by-step execution traces for all workflows
```

---

## 2. Experimental Reproduction Instructions

### Prerequisites
- Python 3.10+
- Dependencies: `numpy`, `scipy`, `scikit-learn`, `matplotlib`, `PIL`
- TeX Compiler: `tectonic` (standalone executable included in root) or standard `pdflatex` + `bibtex`

### Single-Command Reproduction
To execute all benchmarks, generate all publication figures, verify grayscale compliance, and recompile the paper PDF:

```bash
python experiments/reproduce.py
```

### Step-by-Step Reproduction
1. **Run All Experiments**:
   ```bash
   python experiments/run_all_experiments.py
   ```
   *Execution time*: approximately 5–10 seconds. All outputs will be written to `results/`.

2. **Generate Empirical Data Plots**:
   ```bash
   python experiments/generate_figures.py
   ```
   Outputs 8 vector PDFs and 300-DPI PNGs into `paper/figures/`.

3. **Generate System Diagrams**:
   ```bash
   python experiments/generate_diagrams.py
   ```
   Outputs `fig_architecture`, `fig_agent_pipeline`, and `fig_governance_hitl` into `paper/figures/`.

4. **Verify Grayscale Compliance**:
   ```bash
   python -c "
   import glob
   from PIL import Image
   import numpy as np
   for p in glob.glob('paper/figures/*.png'):
       im = Image.open(p).convert('RGB')
       arr = np.array(im)
       diff = max(np.abs(arr[:,:,0].astype(int) - arr[:,:,1].astype(int)).max(),
                  np.abs(arr[:,:,0].astype(int) - arr[:,:,2].astype(int)).max())
       assert diff == 0, f'Color detected in {p}'
   print('All figures are 100% verified pure grayscale.')
   "
   ```

5. **Compile Publication Paper**:
   ```bash
   ./tectonic.exe paper/main.tex
   ```
   Generates `paper/main.pdf`.

---

## 3. Experimental Parameters & Seeds

- **Random Seeds**: The experiments run across fixed random seeds (default: `42`, `1042`, `2042`) to guarantee exact reproducibility of stochastic components.
- **Workflow Configurations**: 3 workflows (Product Launch, Invoice Reconciliation, Customer Churn) $\times$ 5 baselines $\times$ 3 seeds $\times$ 20 runs per seed = **900 total workflow runs**.
- **Adversarial Evaluation**: 240 red-team attack vectors partitioned equally across 6 attack classes (40 vectors each):
  1. Prompt Injections in contextual data
  2. Malformed / Out-of-Schema tool arguments
  3. Domain Policy Violations (spending limits, unapproved recipients)
  4. Hallucinated non-existent entities
  5. Cross-Tenant data access attempts
  6. Cryptographic log tampering (modifications, deletions, truncations)
- **Statistical Significance**: Paired Wilcoxon signed-rank tests computed with `scipy.stats.wilcoxon`, reporting exact $p$-values and Cohen's $d$ effect sizes.

