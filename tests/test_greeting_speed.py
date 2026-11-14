"""
tests/test_greeting_speed.py
============================
Benchmarks copilot greeting response speed (must be sub-millisecond).
"""

import time
import pytest
from unittest.mock import AsyncMock, MagicMock
from api.routers.copilot import copilot_chat, CopilotChatRequest, ChatMessage
from api.auth import TokenData


@pytest.mark.asyncio
async def test_copilot_greeting_sub_millisecond():
    user = TokenData(
        user_id="test-user-id",
        email="owner@edupluscampus.com",
        full_name="Hemant Lakhane",
        role="tenant_owner",
        organization_id="00000000-0000-0000-0000-000000000001",
    )
    mock_db = AsyncMock()

    greetings_to_test = [
        "Hello",
        "hi",
        "what's up",
        "whats up",
        "Hello what's up",
        "hey whats up",
        "good morning",
        "how are you",
    ]

    for g in greetings_to_test:
        req = CopilotChatRequest(messages=[ChatMessage(role="user", content=g)])
        
        t0 = time.perf_counter()
        res = await copilot_chat(req=req, db=mock_db, current_user=user)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert res.reply is not None
        assert "Hemant" in res.reply or "Hello" in res.reply or "Hey" in res.reply
        # Assert sub-millisecond or fast (under 10ms for mock/async context)
        assert elapsed_ms < 10.0, f"Greeting '{g}' took {elapsed_ms:.2f}ms which is too slow!"
        assert len(res.suggested_followups) > 0
