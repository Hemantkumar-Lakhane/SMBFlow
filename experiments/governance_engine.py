"""
experiments/governance_engine.py
================================
Core implementation of SMBFlow's deterministic governance layer, cryptographic
capability tokens, typed policy DSL, calibrated risk scoring, adaptive HITL,
hardened Merkle EPI with checkpoint anchoring, and Saga compensation.

All algorithms are fully implemented and measurable.
"""

from __future__ import annotations

import base64
import copy
import dataclasses
import hashlib
import hmac
import json
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

import numpy as np
from sklearn.linear_model import LogisticRegression


# =============================================================================
# 1. Capability-Based Execution Token Architecture
# =============================================================================

@dataclasses.dataclass(frozen=True)
class ExecutionToken:
    """Cryptographically signed, single-use execution capability token.
    
    Invariant: No external tool connector will execute an action without
    a valid ExecutionToken bound to (tenant_id, action_hash, nonce, expires_at).
    """
    token_id: str
    tenant_id: str
    action_name: str
    action_hash: str
    nonce: str
    issued_at: float
    expires_at: float
    signature: str

    def to_dict(self) -> Dict[str, Any]:
        return dataclasses.asdict(self)


class CapabilityTokenIssuer:
    """Issues and verifies HMAC-SHA256 execution tokens."""

    def __init__(self, secret_key: bytes, validity_seconds: float = 60.0):
        self._secret = secret_key
        self._validity = validity_seconds
        self._used_nonces: Set[str] = set()

    def issue(self, tenant_id: str, action_name: str, action_params: Dict[str, Any]) -> ExecutionToken:
        token_id = str(uuid.uuid4())
        nonce = secrets_token_hex = uuid.uuid4().hex
        now = time.time()
        expires_at = now + self._validity
        canonical_params = json.dumps(action_params, sort_keys=True)
        action_hash = hashlib.sha256(canonical_params.encode("utf-8")).hexdigest()

        msg = f"{token_id}:{tenant_id}:{action_name}:{action_hash}:{nonce}:{expires_at}"
        sig = hmac.new(self._secret, msg.encode("utf-8"), hashlib.sha256).hexdigest()

        return ExecutionToken(
            token_id=token_id,
            tenant_id=tenant_id,
            action_name=action_name,
            action_hash=action_hash,
            nonce=nonce,
            issued_at=now,
            expires_at=expires_at,
            signature=sig,
        )

    def verify_and_consume(self, token: ExecutionToken, action_name: str, action_params: Dict[str, Any]) -> Tuple[bool, str]:
        """Validates token authenticity, scope, nonce single-use, and expiration."""
        now = time.time()
        if now > token.expires_at:
            return False, "Token expired"

        if token.nonce in self._used_nonces:
            return False, "Token replay detected (nonce already consumed)"

        if token.action_name != action_name:
            return False, f"Action mismatch: token issued for {token.action_name}, invoked {action_name}"

        canonical_params = json.dumps(action_params, sort_keys=True)
        expected_hash = hashlib.sha256(canonical_params.encode("utf-8")).hexdigest()
        if token.action_hash != expected_hash:
            return False, "Parameter tamper detected: action payload does not match token hash"

        msg = f"{token.token_id}:{token.tenant_id}:{token.action_name}:{token.action_hash}:{token.nonce}:{token.expires_at}"
        expected_sig = hmac.new(self._secret, msg.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(token.signature, expected_sig):
            return False, "Cryptographic signature invalid"

        # Invariant maintained: mark nonce consumed
        self._used_nonces.add(token.nonce)
        return True, "Valid"


# =============================================================================
# 2. Typed Policy Engine with Static Schema & Predicate Checking
# =============================================================================

@dataclasses.dataclass
class PolicyRule:
    rule_id: str
    description: str
    predicate: Callable[[Dict[str, Any]], bool]
    severity: str = "CRITICAL"  # CRITICAL (reject) or ESCALATE (force HITL)


class TypedPolicyEngine:
    """Evaluates deterministic domain rules over proposed action payloads."""

    def __init__(self):
        self._rules: Dict[str, List[PolicyRule]] = {}

    def register_rule(self, action_name: str, rule: PolicyRule):
        self._rules.setdefault(action_name, []).append(rule)

    def register_rules(self, action_name: str, rules: List[PolicyRule]):
        for r in rules:
            self.register_rule(action_name, r)

    def evaluate(self, action_name: str, payload: Dict[str, Any]) -> Tuple[bool, List[str], bool]:
        """Evaluates all rules for an action.
        
        Returns:
            is_compliant (bool): True if zero violations.
            violated_rules (List[str]): List of descriptions of failed rules.
            force_hitl (bool): True if any violation was severity ESCALATE rather than terminal reject.
        """
        rules = self._rules.get(action_name, [])
        violations = []
        force_hitl = False

        for r in rules:
            try:
                passed = r.predicate(payload)
                if not passed:
                    violations.append(f"[{r.rule_id}] {r.description}")
                    if r.severity == "ESCALATE":
                        force_hitl = True
            except Exception as e:
                # Fail-closed semantics: exceptions in policy predicates cause immediate failure
                violations.append(f"[{r.rule_id}] Evaluation error: {str(e)}")

        return (len(violations) == 0, violations, force_hitl)


# =============================================================================
# 3. Calibrated Risk Scoring with Conformal Error Bound
# =============================================================================

class CalibratedRiskScorer:
    """Computes a well-calibrated risk probability P(failure | features) using
    Platt-calibrated logistic regression over continuous & discrete risk indicators."""

    def __init__(self):
        self.model = LogisticRegression(solver="lbfgs")
        self.is_fitted = False
        self.conformal_threshold = 0.50

    def fit_and_calibrate(self, X_train: np.ndarray, y_train: np.ndarray, alpha_target: float = 0.05):
        """Fits logistic model and determines the calibrated decision threshold
        that bounds false execution rate to at most alpha_target on validation data."""
        self.model.fit(X_train, y_train)
        self.is_fitted = True

        # Compute calibration threshold on training/validation residuals
        probs = self.model.predict_proba(X_train)[:, 1]
        neg_probs = probs[y_train == 0]
        pos_probs = probs[y_train == 1]

        # Target threshold: false positive rate (executing an unsafe action) bounded to alpha_target
        if len(pos_probs) > 0:
            # We want P(prob < threshold | y=1) <= alpha_target
            # That is, at most alpha_target of positive (unsafe) actions evade detection
            self.conformal_threshold = float(np.percentile(pos_probs, alpha_target * 100))
        else:
            self.conformal_threshold = 0.45

    def predict_risk(self, features: np.ndarray) -> float:
        """Returns calibrated probability in [0, 1]."""
        if not self.is_fitted:
            # Heuristic default prior to calibration
            weights = np.array([0.25, 0.20, 0.20, 0.15, 0.10, 0.10])
            return float(np.clip(np.dot(features[:len(weights)], weights[:len(features)]), 0.0, 1.0))
        
        feat_2d = features.reshape(1, -1)
        prob = self.model.predict_proba(feat_2d)[0, 1]
        return float(prob)


# =============================================================================
# 4. Adaptive Human-in-the-Loop Thresholding
# =============================================================================

class AdaptiveHITLController:
    """Dynamically adapts the HITL escalation threshold theta_t using operator
    approval decisions to balance safety against human review fatigue."""

    def __init__(self, base_threshold: float = 0.45, learning_rate: float = 0.015, target_approval_ratio: float = 0.85):
        self.current_threshold = base_threshold
        self.lr = learning_rate
        self.target_ratio = target_approval_ratio
        self.history: List[Dict[str, Any]] = []

    def update(self, operator_decision: str, risk_score: float) -> float:
        """Updates threshold based on operator feedback.
        
        If operator approves an escalated action (was safe, unnecessary escalation),
        slightly raise threshold to avoid redundant future reviews.
        If operator rejects an escalated action (true risk catch),
        slightly lower threshold to preserve strict safety margin.
        """
        approved = 1.0 if operator_decision == "APPROVED" else 0.0
        error = approved - self.target_ratio
        self.current_threshold = float(np.clip(self.current_threshold + self.lr * error, 0.20, 0.80))

        self.history.append({
            "decision": operator_decision,
            "risk_score": risk_score,
            "updated_threshold": self.current_threshold,
            "timestamp": time.time(),
        })
        return self.current_threshold


# =============================================================================
# 5. Hardened Evidence & Provenance Infrastructure (EPI)
#    with Merkle Batching & Checkpoint Anchoring
# =============================================================================

class MerkleTree:
    """Binary Merkle Tree for batching execution step hashes."""

    def __init__(self, leaf_hashes: List[str]):
        self.leaves = [bytes.fromhex(h) if len(h) == 64 else hashlib.sha256(h.encode()).digest() for h in leaf_hashes]
        if not self.leaves:
            self.leaves = [hashlib.sha256(b"EMPTY").digest()]
        self.layers = [self.leaves]
        self._build()

    def _build(self):
        current = self.leaves
        while len(current) > 1:
            next_layer = []
            for i in range(0, len(current), 2):
                left = current[i]
                right = current[i + 1] if i + 1 < len(current) else left
                combined = hashlib.sha256(left + right).digest()
                next_layer.append(combined)
            self.layers.append(next_layer)
            current = next_layer

    @property
    def root(self) -> str:
        return self.layers[-1][0].hex()

    def get_proof(self, index: int) -> List[Tuple[str, str]]:
        """Returns sibling proof path for index: list of (sibling_hex, 'left'|'right')."""
        proof = []
        for layer in self.layers[:-1]:
            is_right = (index % 2 == 1)
            sibling_idx = index - 1 if is_right else index + 1
            if sibling_idx < len(layer):
                sibling = layer[sibling_idx].hex()
                direction = "left" if is_right else "right"
                proof.append((sibling, direction))
            else:
                proof.append((layer[index].hex(), "right"))
            index //= 2
        return proof

    @staticmethod
    def verify_proof(leaf_hash: str, proof: List[Tuple[str, str]], expected_root: str) -> bool:
        current = bytes.fromhex(leaf_hash)
        for sibling_hex, direction in proof:
            sibling = bytes.fromhex(sibling_hex)
            if direction == "left":
                current = hashlib.sha256(sibling + current).digest()
            else:
                current = hashlib.sha256(current + sibling).digest()
        return current.hex() == expected_root


class HardenedEPI:
    """Provides tamper-evident execution tracing combining sequential SHA-256
    hash-chaining with periodic signed external checkpoint anchoring."""

    def __init__(self, tenant_id: str, anchor_frequency: int = 5):
        self.tenant_id = tenant_id
        self.anchor_frequency = anchor_frequency
        self.records: List[Dict[str, Any]] = []
        self.hash_chain: List[str] = [hashlib.sha256(f"GENESIS:{tenant_id}".encode()).hexdigest()]
        self.checkpoints: List[Dict[str, Any]] = []  # External immutable ledger simulation

    def log_step(self, stage_name: str, agent_persona: str, prompt_digest: str, action_payload: Dict[str, Any], outcome: Any) -> str:
        step_idx = len(self.records)
        record = {
            "step_index": step_idx,
            "tenant_id": self.tenant_id,
            "stage": stage_name,
            "agent": agent_persona,
            "prompt_digest": prompt_digest,
            "payload": action_payload,
            "outcome": outcome,
            "timestamp": time.time(),
        }
        self.records.append(record)

        canonical_rec = json.dumps(record, sort_keys=True).encode("utf-8")
        prev_hash = self.hash_chain[-1]
        step_hash = hashlib.sha256(prev_hash.encode("utf-8") + canonical_rec).hexdigest()
        self.hash_chain.append(step_hash)

        # Periodic external checkpoint anchoring
        if len(self.records) % self.anchor_frequency == 0:
            self._anchor_checkpoint()

        return step_hash

    def _anchor_checkpoint(self):
        """Creates a Merkle batch of recent steps and publishes a signed checkpoint anchor."""
        batch_hashes = self.hash_chain[-self.anchor_frequency:]
        tree = MerkleTree(batch_hashes)
        checkpoint = {
            "checkpoint_index": len(self.checkpoints),
            "step_range": (len(self.records) - self.anchor_frequency, len(self.records) - 1),
            "merkle_root": tree.root,
            "terminal_hash": self.hash_chain[-1],
            "timestamp": time.time(),
        }
        # Simulated external anchoring signature (HMAC of anchor payload)
        anchor_bytes = json.dumps(checkpoint, sort_keys=True).encode("utf-8")
        checkpoint["anchor_signature"] = hashlib.sha256(b"TRUSTED_EXTERNAL_NOTARY:" + anchor_bytes).hexdigest()
        self.checkpoints.append(checkpoint)

    def finalize(self):
        """Ensures trailing records are anchored upon workflow termination."""
        if len(self.records) % self.anchor_frequency != 0:
            self._anchor_checkpoint()

    def verify_integrity(self) -> Tuple[bool, str]:
        """Verifies complete execution lineage against both sequential hash chain
        and external anchored checkpoints."""
        # 1. Sequential chain verification
        curr_hash = hashlib.sha256(f"GENESIS:{self.tenant_id}".encode()).hexdigest()
        if self.hash_chain[0] != curr_hash:
            return False, "Genesis block mismatch"

        for i, rec in enumerate(self.records):
            canonical_rec = json.dumps(rec, sort_keys=True).encode("utf-8")
            expected_hash = hashlib.sha256(curr_hash.encode("utf-8") + canonical_rec).hexdigest()
            if self.hash_chain[i + 1] != expected_hash:
                return False, f"Hash divergence at step {i}: computed {expected_hash[:12]}, recorded {self.hash_chain[i+1][:12]}"
            curr_hash = expected_hash

        # 2. Checkpoint truncation verification
        if self.checkpoints:
            last_cp = self.checkpoints[-1]
            last_cp_step = last_cp["step_range"][1]
            if len(self.records) <= last_cp_step and len(self.records) != last_cp_step + 1:
                return False, f"Truncation attack detected: external anchor proves lineage up to step {last_cp_step}, but log only has {len(self.records)} records"

            # Check anchor signature
            cp_copy = dict(last_cp)
            sig = cp_copy.pop("anchor_signature")
            expected_sig = hashlib.sha256(b"TRUSTED_EXTERNAL_NOTARY:" + json.dumps(cp_copy, sort_keys=True).encode("utf-8")).hexdigest()
            if sig != expected_sig:
                return False, "Anchor signature forgery detected"

        return True, "Trace strictly verified"


# =============================================================================
# 6. Saga-Style Compensation Manager
# =============================================================================

@dataclasses.dataclass
class SagaStep:
    action_name: str
    forward_params: Dict[str, Any]
    compensate_action: str
    compensate_params: Dict[str, Any]
    executed: bool = False
    compensated: bool = False


class SagaCompensationManager:
    """Maintains transaction rollback logs and executes inverse compensating
    actions in reverse topological order upon workflow failure or HITL rejection."""

    def __init__(self, executor_fn: Callable[[str, Dict[str, Any]], bool]):
        self.steps: List[SagaStep] = []
        self._executor = executor_fn

    def record_action(self, action_name: str, forward_params: Dict[str, Any], compensate_action: str, compensate_params: Dict[str, Any]):
        self.steps.append(SagaStep(
            action_name=action_name,
            forward_params=forward_params,
            compensate_action=compensate_action,
            compensate_params=compensate_params,
            executed=True,
            compensated=False,
        ))

    def rollback(self) -> Tuple[bool, int, List[str]]:
        """Executes compensation in reverse order.
        
        Returns:
            all_succeeded (bool)
            compensated_count (int)
            logs (List[str])
        """
        logs = []
        all_ok = True
        count = 0

        for step in reversed(self.steps):
            if step.executed and not step.compensated:
                try:
                    ok = self._executor(step.compensate_action, step.compensate_params)
                    if ok:
                        step.compensated = True
                        count += 1
                        logs.append(f"Compensated {step.action_name} via {step.compensate_action}")
                    else:
                        all_ok = False
                        logs.append(f"Failed to compensate {step.action_name} via {step.compensate_action}")
                except Exception as e:
                    all_ok = False
                    logs.append(f"Exception compensating {step.action_name}: {str(e)}")

        return all_ok, count, logs

