"""
SMBFlow - Meeting Intelligence Multi-Mode Comprehensive Test Suite
Tests all 3 input modes:
  Mode A: Pasted Text Transcript (Zero audio/Meet URL requirements)
  Mode B: Audio Upload (File upload validation, audio format checking)
  Mode C: Google Meet (OAuth status, authorize-url, conference record resolver)
"""

import asyncio
import io
import uuid
import pytest
from fastapi.testclient import TestClient
from api.main import app
from api.auth import create_access_token, get_current_user, TokenData
from db.models.core import Base
import core.database as db_mod

TEST_USER_ID = str(uuid.uuid4())
TEST_ORG_ID = str(uuid.uuid4())

MOCK_USER = TokenData(
    user_id=TEST_USER_ID,
    email="tester@smbflow.test",
    role="platform_admin",
    organization_id=TEST_ORG_ID,
    tenant_id=TEST_ORG_ID,
)

token = create_access_token({
    "sub": TEST_USER_ID,
    "email": "tester@smbflow.test",
    "role": "platform_admin",
    "organization_id": TEST_ORG_ID,
})

client = TestClient(app)
client.headers["Authorization"] = f"Bearer {token}"
app.dependency_overrides[get_current_user] = lambda: MOCK_USER


def setup_module(module):
    """Ensure all required DB tables exist for integration tests."""
    async def _init():
        async with db_mod.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    try:
        asyncio.run(_init())
    except Exception as e:
        # If an event loop is already running, run on current loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_init())
        else:
            loop.run_until_complete(_init())


# ── Mode A: Pasted Transcript ────────────────────────────────────────────────

def test_paste_transcript_mode_end_to_end():
    """Verify pasted transcript mode executes cleanly across nodes without audio files."""
    transcript_text = (
        "Sarah Jenkins: Thanks everyone for joining today's roadmap review.\n"
        "David Chen: I have reviewed the Q3 delivery goals. I commit to completing the API security audit by next Wednesday.\n"
        "Sarah Jenkins: Excellent. I will send the updated timeline to the board and prepare the budget allocation.\n"
        "David Chen: Could you also ensure the client credentials are refreshed before Monday?\n"
        "Sarah Jenkins: Yes, I will handle that personally."
    )

    # Node 1: Capture
    capture_resp = client.post(
        "/api/v1/workflows/meeting-intelligence/capture",
        json={
            "conversation_title": "Q3 Roadmap & Security Audit Review",
            "contact_name": "David Chen",
            "conversation_type": "Online Meeting",
            "input_mode": "paste_transcript",
            "transcript": transcript_text,
            "language": "English",
        },
    )
    assert capture_resp.status_code == 200, capture_resp.text
    data = capture_resp.json()
    instance_id = data["instance_id"]
    assert data["status"] in ["captured", "capture_completed"]
    assert data["source_provenance"]["mode"] == "paste_transcript"
    assert data["source_provenance"]["transcript_length"] == len(transcript_text)
    assert data["conversation_data"]["input_mode"] == "paste_transcript"
    assert data["conversation_data"]["recording"]["stored_path"] == "inline://pasted_transcript"

    # Node 2: Process Conversation (Zero audio file path check)
    proc_resp = client.post(
        "/api/v1/workflows/meeting-intelligence/process-conversation",
        json={"instance_id": instance_id},
    )
    assert proc_resp.status_code == 200, proc_resp.text
    proc_data = proc_resp.json()
    assert proc_data["status"] in ["processed", "completed"]
    assert proc_data["transcript_text"] == transcript_text
    assert "extraction" in proc_data
    assert proc_data["source_provenance"]["mode"] == "paste_transcript"

    # Node 3: Central Memory
    mem_resp = client.post(
        "/api/v1/workflows/meeting-intelligence/central-memory",
        json={"instance_id": instance_id},
    )
    assert mem_resp.status_code == 200, mem_resp.text
    mem_data = mem_resp.json()
    assert mem_data["status"] in ["memory_indexed", "completed"]
    assert mem_data["memory"]["contact_name"] == "David Chen"

    # Node 4: Action Generator
    act_resp = client.post(
        "/api/v1/workflows/meeting-intelligence/actions",
        json={"instance_id": instance_id},
    )
    assert act_resp.status_code == 200, act_resp.text
    act_data = act_resp.json()
    assert act_data["status"] in ["actions_generated", "completed"]
    assert "our_commitments" in act_data
    assert "contact_commitments" in act_data

    # Node 5A: Follow-up Email Draft
    draft_resp = client.post(
        "/api/v1/workflows/meeting-intelligence/followup-draft",
        json={"instance_id": instance_id},
    )
    assert draft_resp.status_code == 200, draft_resp.text
    draft_data = draft_resp.json()
    assert draft_data["status"] in ["draft_generated", "awaiting_review", "completed"]
    assert "draft" in draft_data
    assert "David Chen" in (draft_data["draft"].get("recipient_name") or draft_data["draft"].get("recipient") or "")


def test_paste_transcript_too_short_rejected():
    """Verify transcripts shorter than 10 characters are rejected with a helpful 400 error."""
    resp = client.post(
        "/api/v1/workflows/meeting-intelligence/capture",
        json={
            "conversation_title": "Short Note",
            "contact_name": "David Chen",
            "conversation_type": "Online Meeting",
            "input_mode": "paste_transcript",
            "transcript": "Hello",  # Only 5 characters
        },
    )
    assert resp.status_code == 400
    assert "at least 10 characters" in resp.json()["detail"]


def test_paste_transcript_empty_rejected():
    """Verify empty transcript in paste_transcript mode is rejected."""
    resp = client.post(
        "/api/v1/workflows/meeting-intelligence/capture",
        json={
            "conversation_title": "Empty Note",
            "contact_name": "David Chen",
            "conversation_type": "Online Meeting",
            "input_mode": "paste_transcript",
            "transcript": "    ",
        },
    )
    assert resp.status_code == 400
    assert "Transcript text is required" in resp.json()["detail"]


# ── Mode B: Audio Upload ─────────────────────────────────────────────────────

def test_audio_upload_invalid_extension():
    """Verify uploading non-audio file extensions returns 400."""
    fake_file = io.BytesIO(b"fake executable payload")
    resp = client.post(
        "/api/v1/workflows/meeting-intelligence/upload-audio",
        files={"file": ("malicious.exe", fake_file, "application/octet-stream")},
    )
    assert resp.status_code == 400
    assert "Invalid file extension" in resp.json()["detail"]


def test_audio_upload_valid_wav_file():
    """Verify uploading a valid .wav file is accepted and stored."""
    # Simple valid RIFF WAV header (44 bytes) + silent PCM samples
    wav_header = (
        b"RIFF" + (36 + 100).to_bytes(4, "little") + b"WAVE"
        + b"fmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little")
        + (1).to_bytes(2, "little") + (16000).to_bytes(4, "little")
        + (32000).to_bytes(4, "little") + (2).to_bytes(2, "little")
        + (16).to_bytes(2, "little") + b"data" + (100).to_bytes(4, "little")
        + b"\x00" * 100
    )
    fake_wav = io.BytesIO(wav_header)
    resp = client.post(
        "/api/v1/workflows/meeting-intelligence/upload-audio",
        files={"file": ("interview.wav", fake_wav, "audio/wav")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "stored_path" in data
    assert data["stored_path"].endswith(".wav")
    assert data["filename"] == "interview.wav"

    # Now capture using this valid audio recording
    capture_resp = client.post(
        "/api/v1/workflows/meeting-intelligence/capture",
        json={
            "conversation_title": "Audio Interview Test",
            "contact_name": "Test Candidate",
            "conversation_type": "Online Meeting",
            "input_mode": "audio_upload",
            "recording": {
                "file_id": data["file_id"],
                "filename": data["filename"],
                "stored_path": data["stored_path"],
                "content_type": data["content_type"],
            },
        },
    )
    assert capture_resp.status_code == 200, capture_resp.text
    cap_data = capture_resp.json()
    assert cap_data["source_provenance"]["mode"] == "audio_upload"
    assert cap_data["source_provenance"]["stored_path"] == data["stored_path"]


def test_audio_upload_missing_recording_rejected():
    """Verify audio_upload mode without recording object is rejected."""
    resp = client.post(
        "/api/v1/workflows/meeting-intelligence/capture",
        json={
            "conversation_title": "Audio Test",
            "contact_name": "Candidate",
            "conversation_type": "Online Meeting",
            "input_mode": "audio_upload",
            "recording": None,
        },
    )
    assert resp.status_code == 400
    assert "Audio recording details are required" in resp.json()["detail"]


# ── Mode C: Google Meet ──────────────────────────────────────────────────────

def test_google_meet_status_endpoint():
    """Verify the Google Meet status endpoint returns connection metadata."""
    resp = client.get("/api/v1/workflows/meeting-intelligence/google/status")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "connected" in data
    assert isinstance(data["connected"], bool)
    assert "scopes" in data


def test_google_meet_authorize_url_endpoint():
    """Verify the authorize-url endpoint returns redirect URL with meetings scopes."""
    resp = client.get(
        "/api/v1/workflows/meeting-intelligence/google/authorize-url?redirect_uri=http://localhost:5173/admin/workflows/meeting_intelligence_followup"
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "authorize_url" in data
    assert "accounts.google.com" in data["authorize_url"]
    assert "meetings.space.readonly" in data["authorize_url"] or "drive.readonly" in data["authorize_url"]


def test_google_meet_capture_and_resolve_flow():
    """Verify Google Meet URL capture stores source provenance and rejects missing URLs."""
    # Capture with valid Google Meet URL format
    meet_url = "https://meet.google.com/xyz-uvwx-rst"
    resp = client.post(
        "/api/v1/workflows/meeting-intelligence/capture",
        json={
            "conversation_title": "Quarterly Partner Sync",
            "contact_name": "Partner Team",
            "conversation_type": "Online Meeting",
            "input_mode": "google_meet",
            "meet_url": meet_url,
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["source_provenance"]["mode"] == "google_meet"
    assert data["source_provenance"]["meet_url"] == meet_url

    # Node 2: Without real Google credentials, reports clear auth requirement (never 500 crashes)
    proc_resp = client.post(
        "/api/v1/workflows/meeting-intelligence/process-conversation",
        json={"instance_id": data["instance_id"]},
    )
    # Either 400/401 with helpful auth requirement or 200 if credentials existed
    assert proc_resp.status_code in [200, 400, 401]
    if proc_resp.status_code in [400, 401]:
        assert "Google Workspace" in proc_resp.json()["detail"] or "Google Meet" in proc_resp.json()["detail"]


def test_google_meet_missing_url_rejected():
    """Verify google_meet mode without meet_url is rejected."""
    resp = client.post(
        "/api/v1/workflows/meeting-intelligence/capture",
        json={
            "conversation_title": "No URL Meeting",
            "contact_name": "Team",
            "conversation_type": "Online Meeting",
            "input_mode": "google_meet",
            "meet_url": "",
        },
    )
    assert resp.status_code == 400
    assert "Google Meet URL or meeting code is required" in resp.json()["detail"]
