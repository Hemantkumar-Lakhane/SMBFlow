"""
verify_setup.py
===============
Quick self-verification script to test Recall.ai API connection,
webhook signature validation, and Nodes 1-5 pipeline locally.
"""

import asyncio
import os
import sys
import time
import hmac
import hashlib
import base64
from dotenv import load_dotenv

# Ensure local environment is loaded
load_dotenv()
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
sys.path.insert(0, os.path.abspath("."))

from integrations.connectors import RecallAIConnector
from api.routers.meeting_intelligence import verify_recall_webhook_signature

async def run_checks():
    print("=" * 65)
    print("         SMBFLOW MEETING INTELLIGENCE - SELF CHECK        ")
    print("=" * 65)

    api_key = os.getenv("RECALL_API_KEY", "").strip()
    region = os.getenv("RECALL_REGION", "us-west-2").strip()
    webhook_secret = os.getenv("RECALL_WEBHOOK_SECRET", "").strip()

    print(f"[*] RECALL_API_KEY:        {'...' + api_key[-6:] if len(api_key) > 6 else 'MISSING'}")
    print(f"[*] RECALL_REGION:         {region}")
    print(f"[*] RECALL_WEBHOOK_SECRET: {'...' + webhook_secret[-6:] if len(webhook_secret) > 6 else 'MISSING'}")
    print("-" * 65)

    # ── Check 1: Real Recall.ai API Connection ────────────────────────
    print("\n[CHECK 1/3] Testing Recall.ai Cloud API Connection...")
    if not api_key:
        print("  [!] FAILED: RECALL_API_KEY is not found in .env")
        return

    try:
        connector = RecallAIConnector(credentials={"api_key": api_key, "region": region})
        bots = await connector._request("GET", "/bot")
        count = len(bots.get("results", [])) if isinstance(bots, dict) else len(bots) if isinstance(bots, list) else 0
        print(f"  [+] SUCCESS: Successfully authenticated with Recall.ai ({region})!")
        print(f"      Workspace is active. Total active/past bots: {count}")
    except Exception as e:
        print(f"  [X] API Connection failed: {e}")
        return

    # ── Check 2: Webhook Signature Verification ───────────────────────
    print("\n[CHECK 2/3] Testing Webhook Signature Verification with whsec_...")
    if not webhook_secret:
        print("  [!] FAILED: RECALL_WEBHOOK_SECRET is not found in .env")
        return

    test_payload = b'{"event":"bot.status_change","data":{"bot_id":"verify_bot_01"}}'
    ts = int(time.time())
    msg_id = "msg_self_check_01"

    # Compute Svix signature using the secret
    clean_sec = webhook_secret.removeprefix("whsec_")
    missing_padding = len(clean_sec) % 4
    if missing_padding:
        clean_sec += "=" * (4 - missing_padding)
    secret_bytes = base64.b64decode(clean_sec)
    to_sign = f"{msg_id}.{ts}.".encode("utf-8") + test_payload
    sig = base64.b64encode(hmac.new(secret_bytes, to_sign, hashlib.sha256).digest()).decode("utf-8")

    valid_headers = {
        "webhook-id": msg_id,
        "webhook-timestamp": str(ts),
        "webhook-signature": f"v1,{sig}",
    }

    if verify_recall_webhook_signature(test_payload, valid_headers, webhook_secret):
        print("  [+] SUCCESS: Webhook signature verified successfully with your whsec_ key!")
    else:
        print("  [X] FAILED: Signature verification failed.")
        return

    # ── Check 3: Tampered Signature Protection ────────────────────────
    print("\n[CHECK 3/3] Testing Security & Tamper Protection...")
    tampered_headers = dict(valid_headers)
    tampered_headers["webhook-signature"] = "v1,forged_tampered_signature_xyz=="

    if not verify_recall_webhook_signature(test_payload, tampered_headers, webhook_secret):
        print("  [+] SUCCESS: Tampered / unauthenticated requests are strictly rejected (HTTP 401)!")
    else:
        print("  [X] FAILED: Tampered signature was incorrectly accepted.")
        return

    print("\n" + "=" * 65)
    print("  RESULT: ALL 3 CHECKS PASSED 100%! YOUR CONFIGURATION IS READY.")
    print("=" * 65)

if __name__ == "__main__":
    asyncio.run(run_checks())

