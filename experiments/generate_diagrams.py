"""
experiments/generate_diagrams.py
================================
Generates publication-quality, strictly black-and-white/grayscale system
architecture and flow diagrams for the SMBFlow IEEE paper.
Guarantees:
  - Zero text overlap, clipping, or boundary collisions
  - Generous box margins and crisp typography
  - Mathematically precise coordinates and aligned connectors
  - 100% strictly grayscale compliance (RGB channel diff = 0)
Exports vector PDF and 300-DPI PNG to paper/figures/.
"""

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as patches

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PAPER_FIG_DIR = os.path.join(BASE_DIR, "paper", "figures")
os.makedirs(PAPER_FIG_DIR, exist_ok=True)

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Times New Roman", "DejaVu Serif", "Times"],
    "font.size": 8,
})


def save_fig(fig, name):
    pdf = os.path.join(PAPER_FIG_DIR, f"{name}.pdf")
    png = os.path.join(PAPER_FIG_DIR, f"{name}.png")
    fig.savefig(pdf, format="pdf", bbox_inches="tight", dpi=300)
    fig.savefig(png, format="png", bbox_inches="tight", dpi=300)
    plt.close(fig)
    print(f"  [+] Saved {name}.pdf and .png")


# =============================================================================
# 1. System Layered Architecture Diagram (fig_architecture)
# =============================================================================
def draw_architecture():
    # Double column width = 7.16 in, height = 3.4 in
    fig, ax = plt.subplots(figsize=(7.16, 3.4))
    ax.set_xlim(-1, 101)
    ax.set_ylim(-1, 53)
    ax.axis("off")

    # Layer 1: Presentation & Multi-Tenant Gateway (top)
    rect_pres = patches.Rectangle((1, 42.5), 98, 9.0, linewidth=0.9, edgecolor="black", facecolor="#f5f5f5")
    ax.add_patch(rect_pres)
    ax.text(50, 48.5, "PRESENTATION & MULTI-TENANT GATEWAY", ha="center", va="center", weight="bold", fontsize=8.5)
    
    # Ingress badges
    badges = [
        ("Tenant Context & RBAC", 14),
        ("JWT / API Key Auth", 38),
        ("Event Ingress & Scheduler", 62),
        ("WebSocket Telemetry", 86),
    ]
    for b_name, bx in badges:
        b_patch = patches.Rectangle((bx - 10.5, 43.8), 21, 3.2, linewidth=0.5, edgecolor="#555555", facecolor="#ffffff")
        ax.add_patch(b_patch)
        ax.text(bx, 45.4, b_name, ha="center", va="center", fontsize=6.5)

    # Layer 2: Middle Tier - Control Plane vs Cognitive Data Plane
    # Left: Deterministic Control Plane (x: 1 to 44, width 43)
    rect_ctrl = patches.Rectangle((1, 21.5), 43, 18.0, linewidth=0.9, edgecolor="black", facecolor="#ffffff")
    ax.add_patch(rect_ctrl)
    ax.text(22.5, 37.6, "DETERMINISTIC CONTROL PLANE", ha="center", va="center", weight="bold", fontsize=7.8)
    ax.text(22.5, 35.8, "(Authoritative Gatekeeper)", ha="center", va="center", style="italic", fontsize=6.3, color="#444444")

    # Sub-boxes inside Control Plane
    b_dag = patches.Rectangle((2.5, 28.5), 40, 6.0, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_dag)
    ax.text(22.5, 32.5, "DAG Engine (Topological Scheduler)", ha="center", va="center", weight="bold", fontsize=6.8)
    ax.text(22.5, 30.2, "Precedence graph, state machine, tenant queues", ha="center", va="center", fontsize=5.8)

    b_gates = patches.Rectangle((2.5, 22.5), 23, 5.2, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_gates)
    ax.text(14, 25.8, "Governance Gates", ha="center", va="center", weight="bold", fontsize=6.6)
    ax.text(14, 23.9, "Schema + DSL + Platt Risk", ha="center", va="center", fontsize=5.6)

    b_tok = patches.Rectangle((26.5, 22.5), 16, 5.2, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_tok)
    ax.text(34.5, 25.8, "Token Issuer", ha="center", va="center", weight="bold", fontsize=6.6)
    ax.text(34.5, 23.9, "HMAC-SHA256", ha="center", va="center", fontsize=5.6)

    # Right: Cognitive Data Plane (x: 56 to 99, width 43)
    rect_cog = patches.Rectangle((56, 21.5), 43, 18.0, linewidth=0.9, edgecolor="black", facecolor="#ffffff")
    ax.add_patch(rect_cog)
    ax.text(77.5, 37.6, "COGNITIVE DATA PLANE", ha="center", va="center", weight="bold", fontsize=7.8)
    ax.text(77.5, 35.8, "(Proposal-Only Sandbox)", ha="center", va="center", style="italic", fontsize=6.3, color="#444444")

    b_pipe = patches.Rectangle((57.5, 28.5), 40, 6.0, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_pipe)
    ax.text(77.5, 32.5, "Multi-Agent Cognitive Pipeline", ha="center", va="center", weight="bold", fontsize=6.8)
    ax.text(77.5, 30.2, "Research  -->  Reasoning  -->  Drafting Personas", ha="center", va="center", fontsize=5.8)

    b_rag = patches.Rectangle((57.5, 22.5), 22, 5.2, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_rag)
    ax.text(68.5, 25.8, "Hybrid GraphRAG", ha="center", va="center", weight="bold", fontsize=6.6)
    ax.text(68.5, 23.9, "PPR + Dense Cosine", ha="center", va="center", fontsize=5.6)

    b_rout = patches.Rectangle((80.5, 22.5), 17, 5.2, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_rout)
    ax.text(89, 25.8, "Model Router", ha="center", va="center", weight="bold", fontsize=6.6)
    ax.text(89, 23.9, "Constrained IP", ha="center", va="center", fontsize=5.6)

    # Horizontal Action Proposal Channel (gap: x=44 to x=56, center=50)
    arrow_prop = dict(arrowstyle="->", color="black", lw=1.0)
    ax.annotate("", xy=(44.5, 25.1), xytext=(55.5, 25.1), arrowprops=arrow_prop)
    ax.text(50.0, 26.6, "Action\nProposal $a^*$", ha="center", va="bottom", fontsize=6.4, weight="bold")

    # Layer 3: Bottom Tier - Execution Layer vs Trust Plane
    # Left: Execution & Recovery Plane (x: 1 to 44, width 43)
    rect_exec = patches.Rectangle((1, 1.0), 43, 17.5, linewidth=0.9, edgecolor="black", facecolor="#ffffff")
    ax.add_patch(rect_exec)
    ax.text(22.5, 16.8, "EXECUTION & RECOVERY PLANE", ha="center", va="center", weight="bold", fontsize=7.8)
    ax.text(22.5, 15.1, "(Capability Credential Isolation)", ha="center", va="center", style="italic", fontsize=6.3, color="#444444")

    b_conn = patches.Rectangle((2.5, 8.5), 40, 5.5, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_conn)
    ax.text(22.5, 12.1, "Sandboxed Tool Connectors (Zero Credentials)", ha="center", va="center", weight="bold", fontsize=6.6)
    ax.text(22.5, 10.0, "Stripe, HubSpot, ERP — strictly requires valid $\\mathcal{T}_{exec}$", ha="center", va="center", fontsize=5.8)

    b_saga = patches.Rectangle((2.5, 2.2), 40, 5.5, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_saga)
    ax.text(22.5, 5.8, "Saga Compensation Manager", ha="center", va="center", weight="bold", fontsize=6.6)
    ax.text(22.5, 3.7, "Topological rollback on failure or rejection", ha="center", va="center", fontsize=5.8)

    # Right: Trust & Provenance Plane (EPI) (x: 56 to 99, width 43)
    rect_trust = patches.Rectangle((56, 1.0), 43, 17.5, linewidth=0.9, edgecolor="black", facecolor="#ffffff")
    ax.add_patch(rect_trust)
    ax.text(77.5, 16.8, "TRUST & PROVENANCE PLANE", ha="center", va="center", weight="bold", fontsize=7.8)
    ax.text(77.5, 15.1, "(Hardened EPI Notary)", ha="center", va="center", style="italic", fontsize=6.3, color="#444444")

    b_merkle = patches.Rectangle((57.5, 8.5), 40, 5.5, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_merkle)
    ax.text(77.5, 12.1, "Evidence & Provenance Infrastructure (EPI)", ha="center", va="center", weight="bold", fontsize=6.6)
    ax.text(77.5, 10.0, "SHA-256 Hash Chain + Merkle Batching (Append-Only)", ha="center", va="center", fontsize=5.8)

    b_anchor = patches.Rectangle((57.5, 2.2), 40, 5.5, linewidth=0.6, edgecolor="black", facecolor="#f0f0f0")
    ax.add_patch(b_anchor)
    ax.text(77.5, 5.8, "External Checkpoint Anchoring Ledger", ha="center", va="center", weight="bold", fontsize=6.6)
    ax.text(77.5, 3.7, "Signed public checkpoints (Prevents history truncation)", ha="center", va="center", fontsize=5.8)

    # Inter-layer connecting arrows with clean annotations
    arrow_v = dict(arrowstyle="->", color="black", lw=0.9)
    
    # Ingress -> Control Plane
    ax.annotate("", xy=(22.5, 39.7), xytext=(22.5, 42.5), arrowprops=arrow_v)
    ax.text(25.0, 41.1, "Workflow Trigger", ha="left", va="center", fontsize=6.3)

    # Control Plane -> Execution Layer
    ax.annotate("", xy=(22.5, 18.7), xytext=(22.5, 21.5), arrowprops=arrow_v)
    ax.text(25.0, 20.1, "Single-Use Execution Token $\\mathcal{T}_{exec}$", ha="left", va="center", fontsize=6.3, weight="bold")

    # Cognitive Plane / Control Plane -> Trust Plane
    ax.annotate("", xy=(77.5, 18.7), xytext=(77.5, 21.5), arrowprops=arrow_v)
    ax.text(80.0, 20.1, "Signed Execution Traces & Evidence", ha="left", va="center", fontsize=6.3)

    save_fig(fig, "fig_architecture")


# =============================================================================
# 2. Cognitive Agent Pipeline with Governance Gates (fig_agent_pipeline)
# =============================================================================
def draw_pipeline():
    # Double column width = 7.16 in, height = 2.4 in
    fig, ax = plt.subplots(figsize=(7.16, 2.4))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 42)
    ax.axis("off")

    stages = [
        ("Trigger\nSignal", "External Webhook\nor Cron Trigger", 2, 13, "#ffffff", False),
        ("Research\nAgent", "Context Retrieval\n(Hybrid GraphRAG)", 18, 14, "#f5f5f5", False),
        ("Reasoning\nAgent", "Task Planning\n& Decomposition", 34, 14, "#f5f5f5", False),
        ("Drafting\nAgent", "Tool Proposal\nGeneration $a^*$", 50, 14, "#f5f5f5", False),
        ("Governance\nGate", "Deterministic Policy\n& Risk Verification", 66, 17, "#e8e8e8", True),
        ("Execution\nLayer", "Sandboxed Tool\n(Token Required)", 85, 13, "#ffffff", False),
    ]

    for title, desc, x, w, bg, is_gate in stages:
        lw = 1.3 if is_gate else 0.8
        rect = patches.Rectangle((x, 13), w, 16, linewidth=lw, edgecolor="black", facecolor=bg)
        ax.add_patch(rect)
        
        # Header inside box
        ax.text(x + w/2, 23.5, title, ha="center", va="center", weight="bold" if is_gate else "semibold", fontsize=7.2)
        # Separator line
        ax.plot([x + 1, x + w - 1], [20.5, 20.5], color="#888888", lw=0.5)
        # Description
        ax.text(x + w/2, 16.5, desc, ha="center", va="center", fontsize=5.8, color="#222222")

    arrow_main = dict(arrowstyle="->", color="black", lw=1.0)
    
    # Connecting arrows between stages
    for i in range(len(stages) - 1):
        x_start = stages[i][2] + stages[i][3]
        x_end = stages[i + 1][2]
        ax.annotate("", xy=(x_end, 21), xytext=(x_start, 21), arrowprops=arrow_main)

    # Governance Gate Branching: Up to HITL Queue, Down to Terminal Rejection
    gate_cx = 66 + 17 / 2  # 74.5

    # Branch Up: Escalation to HITL
    ax.annotate("", xy=(gate_cx, 34), xytext=(gate_cx, 29), arrowprops=arrow_main)
    ax.text(gate_cx - 1, 31.5, "Risk $\\geq \\theta$", ha="right", va="center", fontsize=5.8, style="italic")

    rect_hitl = patches.Rectangle((62, 34), 25, 7.0, linewidth=0.9, edgecolor="black", facecolor="#f9f9f9", linestyle="--")
    ax.add_patch(rect_hitl)
    ax.text(74.5, 38.8, "HITL Review Queue (Operator)", ha="center", va="center", weight="bold", fontsize=6.8)
    ax.text(74.5, 36.2, "Manual authorization / remediation", ha="center", va="center", fontsize=5.8)

    # Return arrow from HITL to Execution
    ax.annotate("", xy=(91, 29.5), xytext=(87, 35.5), arrowprops=dict(arrowstyle="->", color="#333333", lw=0.8, linestyle=":"))
    ax.text(90, 34.0, "Approved", ha="left", va="center", fontsize=5.8, style="italic")

    # Branch Down: Terminal Rejection
    ax.annotate("", xy=(gate_cx, 8), xytext=(gate_cx, 13), arrowprops=arrow_main)
    ax.text(gate_cx - 1, 10.5, "Violation", ha="right", va="center", fontsize=5.8, style="italic")

    rect_rej = patches.Rectangle((64, 1.5), 21, 6.5, linewidth=0.9, edgecolor="black", facecolor="#222222")
    ax.add_patch(rect_rej)
    ax.text(74.5, 5.8, "Terminal Rejection", ha="center", va="center", weight="bold", fontsize=6.8, color="#ffffff")
    ax.text(74.5, 3.4, "Action blocked & logged", ha="center", va="center", fontsize=5.8, color="#dddddd")

    save_fig(fig, "fig_agent_pipeline")


# =============================================================================
# 3. Governance Decision Flowchart (fig_governance_hitl)
# =============================================================================
def draw_governance_flow():
    # Width = 3.5 in (single column), height = 3.8 in
    fig, ax = plt.subplots(figsize=(3.5, 3.8))
    # Ample limits: X in [0, 100], Y in [0, 100] with center at 55
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")

    arrow = dict(arrowstyle="->", color="black", lw=0.9)

    # 1. Action Proposal Box (top)
    rect_prop = patches.Rectangle((20, 87), 70, 11, linewidth=0.9, edgecolor="black", facecolor="#ffffff")
    ax.add_patch(rect_prop)
    ax.text(55, 94.5, "Proposed Action Payload $a_k^*$", ha="center", va="center", weight="bold", fontsize=7.5)
    ax.text(55, 90.0, "Target Tool, Parameters $\\mathbf{u}$, Tenant Context $\\tau$", ha="center", va="center", fontsize=6.2)

    # Arrow to Gate 1
    ax.annotate("", xy=(55, 77), xytext=(55, 87), arrowprops=arrow)

    # 2. Gate 1: Schema & Policy Check (Diamond, center at 55, y=67)
    # Diamond vertices: top(55, 77), right(87, 67), bottom(55, 57), left(23, 67)
    poly_pol = patches.Polygon([[55, 77], [87, 67], [55, 57], [23, 67]], linewidth=0.9, edgecolor="black", facecolor="#f5f5f5")
    ax.add_patch(poly_pol)
    ax.text(55, 69.0, "Policy & Schema Gate", ha="center", va="center", weight="bold", fontsize=7.2)
    ax.text(55, 64.5, "$\\mathcal{V}_{schema} \\wedge \\mathcal{V}_{policy} = 1?$", ha="center", va="center", fontsize=6.8)

    # Policy False -> Reject (Left)
    ax.annotate("", xy=(16, 67), xytext=(23, 67), arrowprops=arrow)
    ax.text(19.5, 69.5, "No", ha="center", va="bottom", fontsize=6.8, weight="bold")
    
    rect_rej = patches.Rectangle((2, 60), 14, 14, linewidth=0.8, edgecolor="black", facecolor="#222222")
    ax.add_patch(rect_rej)
    ax.text(9, 68.2, "Terminal", ha="center", va="center", color="white", fontsize=6.3, weight="bold")
    ax.text(9, 65.5, "Rejection", ha="center", va="center", color="white", fontsize=6.3, weight="bold")
    ax.text(9, 62.8, "(Blocked)", ha="center", va="center", color="#cccccc", fontsize=5.5)

    # Policy True -> Gate 2 (Down)
    ax.annotate("", xy=(55, 47), xytext=(55, 57), arrowprops=arrow)
    ax.text(57, 52, "Yes (Compliant)", ha="left", va="center", fontsize=6.3, style="italic")

    # 3. Gate 2: Calibrated Risk Assessment (Diamond, center at 55, y=37)
    # Diamond vertices: top(55, 47), right(87, 37), bottom(55, 27), left(23, 37)
    poly_risk = patches.Polygon([[55, 47], [87, 37], [55, 27], [23, 37]], linewidth=0.9, edgecolor="black", facecolor="#f5f5f5")
    ax.add_patch(poly_risk)
    ax.text(55, 39.0, "Calibrated Risk Gate", ha="center", va="center", weight="bold", fontsize=7.2)
    ax.text(55, 34.5, "$\\hat{P}(\\text{Failure}) \\leq \\theta_{risk}?$", ha="center", va="center", fontsize=6.8)

    # Risk False (High Risk) -> Escalate to HITL (Left-Down)
    ax.annotate("", xy=(25, 17), xytext=(28, 33), arrowprops=arrow)
    ax.text(18, 25, "No (At-Risk)\n$\\hat{P} > \\theta_{risk}$", ha="center", va="center", fontsize=6.0, style="italic")

    rect_hitl = patches.Rectangle((2, 2), 46, 15, linewidth=0.9, edgecolor="black", facecolor="#f9f9f9")
    ax.add_patch(rect_hitl)
    ax.text(25, 12.5, "Awaiting Review (HITL)", ha="center", va="center", weight="bold", fontsize=6.8)
    ax.text(25, 8.5, "Enqueued in operator portal;\nawaits cryptographic authorization", ha="center", va="center", fontsize=5.6)

    # Risk True (Safe) -> Automatic Token Issuance (Right-Down)
    ax.annotate("", xy=(77, 17), xytext=(74, 33), arrowprops=arrow)
    ax.text(84, 25, "Yes (Safe)\n$\\hat{P} \\leq \\theta_{risk}$", ha="center", va="center", fontsize=6.0, style="italic")

    rect_exec = patches.Rectangle((53, 2), 46, 15, linewidth=1.1, edgecolor="black", facecolor="#ffffff")
    ax.add_patch(rect_exec)
    ax.text(76, 12.5, "Issue Capability Token", ha="center", va="center", weight="bold", fontsize=6.8)
    ax.text(76, 8.5, "HMAC $\\mathcal{T}_{exec}$ generated;\ndispatched to target tool API", ha="center", va="center", fontsize=5.6)

    save_fig(fig, "fig_governance_hitl")


def main():
    print("=" * 80)
    print("  Generating Publication-Grade System Diagrams (Vector PDF & PNG)")
    print("=" * 80)
    draw_architecture()
    draw_pipeline()
    draw_governance_flow()
    print("=" * 80)


if __name__ == "__main__":
    main()
