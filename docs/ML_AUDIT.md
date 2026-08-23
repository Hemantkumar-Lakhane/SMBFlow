# ML AUDIT

**IMPORTANT FINDING:** There is NO classical Machine Learning in this repository.

## Overview
As this is an ML course project, it is critical to distinguish between traditional ML and LLM API wrapping.

### 1. Classical ML (Missing)
- No `scikit-learn`, `xgboost`, `tensorflow`, or `pytorch` imports.
- No model training code.
- No feature engineering, data imputation, or normalization scripts.
- No dataset splitting (train/val/test).
- No evaluation metrics like RMSE, F1-score, or AUC.

### 2. Statistical / Rule-Based Logic
- There are rule-based weights defined in JSON configs (e.g., `usage_drop_weight: 0.40`), but these are evaluated either via simple math or fed into an LLM prompt as context.

### 3. LLM-Based Reasoning (Implemented)
- The system heavily relies on LLMs (Claude, OpenAI, Gemini, Groq via `litellm`) to perform all "reasoning".
- The "Reasoning Agent" takes raw data, injects it into a prompt, and asks the LLM to output a churn risk score.
- **File:** `workflows/prompts/saas/reasoning_churn.txt` and `agents/agents.py`.

### 4. Retrieval / RAG (Implemented)
- Uses `pgvector` in PostgreSQL for vector embeddings (`rag_embeddings` table).
- Implemented in `core/rag_engine.py` for context retrieval.
- Uses OpenAI/LiteLLM embedding models (`text-embedding-3-small`).

## Alignment with ML Course Requirements
If the course requires training a predictive model, **this project currently fails that requirement.** It is an Orchestration/Prompt-Engineering platform.

**Recommended Action:** We must build a real predictive ML component (e.g., a Churn Prediction Random Forest or XGBoost model) and integrate its output into the Workflow Engine to satisfy academic requirements.
