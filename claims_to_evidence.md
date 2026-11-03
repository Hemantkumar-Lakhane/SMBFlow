# Claims-to-Evidence Traceability Matrix

This document provides a comprehensive mapping between every quantitative claim, metric, and finding reported in the paper (*"SMBFlow: A Deterministically Governed Multi-Agent Architecture for Context-Aware Workflow Automation in Enterprise Environments"*) and the exact experimental script, raw result CSV file, and JSON log that generated it.

---

## Traceability Matrix

| # | Quantitative Claim in Paper | Value Reported | Generation Script | Primary Evidence File | Raw Logs / Verification Target |
| :- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Unsafe Execution Rate (SMBFlow)** | **0.0%** across 900 runs | `experiments/run_all_experiments.py` | `results/main_results.csv` | `results/raw_logs/workflow_execution_traces.jsonl` (0 unsafe executions) |
| **2** | **Unsafe Execution Rate (Ungated ReAct)** | **14.7%--20.3%** (14.67%, 20.33%, 12.67%) | `experiments/run_all_experiments.py` | `results/main_results.csv` | `results/main_results.csv` (rows 2, 7, 12) |
| **3** | **Unsafe Execution Rate (LangGraph)** | **8.0%--8.7%** (8.00%, 8.67%, 8.67%) | `experiments/run_all_experiments.py` | `results/main_results.csv` | `results/main_results.csv` (rows 3, 8, 13) |
| **4** | **Unsafe Execution Rate (AutoGen)** | **7.0%--7.7%** (7.00%, 7.33%, 7.67%) | `experiments/run_all_experiments.py` | `results/main_results.csv` | `results/main_results.csv` (rows 4, 9, 14) |
| **5** | **Task Success Rate (SMBFlow)** | **89.0%--92.3%** (89.0%, 92.33%, 92.33%) | `experiments/run_all_experiments.py` | `results/main_results.csv` | `results/main_results.csv` (rows 6, 11, 16) |
| **6** | **Task Success Rate (Baselines)** | ReAct: 76.7%--82.7%, AutoGen: 69.7%--74.0%, DAG: 27.0%--28.0% | `experiments/run_all_experiments.py` | `results/main_results.csv` | `results/main_results.csv` (all baseline rows) |
| **7** | **Adversarial Red-Team Block Rate** | **100.0%** (240/240 blocked across 6 classes) | `experiments/run_all_experiments.py` | `results/adversarial_results.csv` | `results/summary_metrics.json` (`adversarial_cases: 240`) |
| **8** | **Prompt Injection Defense** | **40/40 blocked (100.0%)** | `experiments/run_all_experiments.py` | `results/adversarial_results.csv` | `results/adversarial_results.csv` (row 2) |
| **9** | **Cross-Tenant Access Defense** | **40/40 blocked (100.0%)** via Capability Token | `experiments/run_all_experiments.py` | `results/adversarial_results.csv` | `results/adversarial_results.csv` (row 6) |
| **10** | **Log Tampering Detection** | **40/40 detected (100.0%)** (Mod/Del/Trunc) | `experiments/run_all_experiments.py` | `results/adversarial_results.csv` | `results/adversarial_results.csv` (row 7) |
| **11** | **Verification Gate Latency** | Median **0.56 ms**, Mean **0.59 ms** (p95: 0.90 ms, p99: 1.09 ms) | `experiments/run_all_experiments.py` | `results/latency_breakdown.csv` | `results/latency_breakdown.csv` (row 5) |
| **12** | **Total Non-LLM System Overhead** | Median **2.23 ms**, Mean **2.21 ms** (p95: 3.09 ms, p99: 3.71 ms) | `experiments/run_all_experiments.py` | `results/latency_breakdown.csv` | `results/latency_breakdown.csv` (row 8) |
| **13** | **LLM Reasoning & Drafting Latency** | Reasoning: 344.7 ms (p50), Drafting: 517.8 ms (p50) | `experiments/run_all_experiments.py` | `results/latency_breakdown.csv` | `results/latency_breakdown.csv` (rows 3, 4) |
| **14** | **Constrained Routing Cost Savings** | **51.83%** vs Always-Frontier (\$0.0154 vs \$0.0320) | `experiments/router.py` | `results/routing_comparison.csv` | `results/routing_comparison.csv` (row 5) |
| **15** | **Full Workflow Cost Reduction** | **74.7%--75.0%** (\$0.0080 vs \$0.0320) | `experiments/run_all_experiments.py` | `results/main_results.csv` | `results/main_results.csv` (columns Mean_Cost_USD) |
| **16** | **Statistical Significance of Cost Savings** | **$p = 6.08 \times 10^{-51}$**, Cohen's $d = 10.06$--$11.35$ | `experiments/run_all_experiments.py` | `results/statistical_tests.csv` | `results/statistical_tests.csv` (all rows) |
| **17** | **Risk Calibration ROC AUC** | **0.7644** across 1,500 trials | `experiments/run_all_experiments.py` | `results/risk_calibration.csv` | `results/risk_calibration.csv` (row 2) |
| **18** | **Risk Brier Score & ECE** | Brier: **0.1652**, Expected Calibration Error: **0.0495** | `experiments/run_all_experiments.py` | `results/risk_calibration.csv` | `results/risk_calibration.csv` (rows 3, 4) |
| **19** | **Conformal False-Execute Bound** | Conformal threshold: **0.4693**, Empirical: **5.18%** (target $\le 5\%$) | `experiments/run_all_experiments.py` | `results/risk_calibration.csv` | `results/risk_calibration.csv` (rows 5, 6, 7) |
| **20** | **Adaptive HITL Review Reduction** | **3.9%** operator review load reduction over 300 steps | `experiments/run_all_experiments.py` | `results/hitl_adaptive.csv` | `results/summary_metrics.json` (`hitl_review_reduction_pct: 3.9`) |
| **21** | **Saga Rollback Success Rate** | **100.0%** rollback success across 200 injected failure trials | `experiments/run_all_experiments.py` | `results/summary_metrics.json` | `results/summary_metrics.json` (`saga_rollback_success_pct: 100.0`) |
| **22** | **GraphRAG Multi-Hop Recall@5** | Hybrid ($\alpha=0.6$): **1.000** vs Vector-Only ($\alpha=1.0$): **0.050** | `experiments/graph_rag.py` | `results/graphrag_ablation.csv` | `results/graphrag_ablation.csv` (rows 5, 7) |
| **23** | **GraphRAG nDCG@5 & MRR** | Hybrid ($\alpha=0.6$): nDCG@5 = **0.8023**, MRR = **0.7500** | `experiments/graph_rag.py` | `results/graphrag_ablation.csv` | `results/graphrag_ablation.csv` (row 5) |
| **24** | **Multi-Tenant Throughput Scaling** | **40.0 wfs/s** (1 tenant) $\to$ **3,982.1 wfs/s** (100 tenants) | `experiments/run_all_experiments.py` | `results/scalability_benchmark.csv` | `results/scalability_benchmark.csv` (columns 1, 2) |
| **25** | **Multi-Tenant Governance Latency** | Mean latency: **18.44 ms** (1 tenant) $\to$ **43.96 ms** (100 tenants) | `experiments/run_all_experiments.py` | `results/scalability_benchmark.csv` | `results/scalability_benchmark.csv` (columns 3, 4, 5) |
| **26** | **EPI Verification Rate & Scaling** | 1,000 steps in **15.79 ms**; 50,000 steps in **704.84 ms** (70,939 step/s) | `experiments/run_all_experiments.py` | `results/epi_benchmark.csv` | `results/epi_benchmark.csv` (rows 6, 9) |
| **27** | **EPI Storage Footprint** | Constant **233.1 bytes/step** (11.38 MB for 50,000 steps) | `experiments/run_all_experiments.py` | `results/epi_benchmark.csv` | `results/epi_benchmark.csv` (columns Total_Storage_KB, Bytes_Per_Step) |

---

## Script and Benchmark Verification

All experimental numbers can be reproduced by executing:
```bash
python experiments/reproduce.py
```
or step-by-step:
1. `python experiments/run_all_experiments.py` (Executes 900 workflow runs, 240 red-team attacks, calibration, scalability, and EPI benchmarks; writes to `results/`)
2. `python experiments/generate_figures.py` (Generates 8 empirical data plots from `results/` in strictly grayscale PDF/PNG)
3. `python experiments/generate_diagrams.py` (Generates 3 architecture and pipeline diagrams in vector PDF/PNG)
4. `tectonic paper/main.tex` (Compiles the publication PDF)

