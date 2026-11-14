"""
tests/test_redis_cache.py
=========================
Unit tests for RedisCache real-time caching and fallback.
"""

import pytest
import asyncio
from core.redis_cache import RedisCache


@pytest.mark.asyncio
async def test_redis_cache_set_get_delete():
    cache = RedisCache()
    # Test setting and getting values
    await cache.set("test:key:1", {"name": "Workflow Alpha", "runs": 42}, ttl=10)
    val = await cache.get("test:key:1")
    assert val is not None
    assert val["name"] == "Workflow Alpha"
    assert val["runs"] == 42

    # Test delete
    await cache.delete("test:key:1")
    val_after = await cache.get("test:key:1")
    assert val_after is None


@pytest.mark.asyncio
async def test_redis_cache_delete_pattern():
    cache = RedisCache()
    await cache.set("test:catalog:org1:admin", {"items": [1, 2]}, ttl=10)
    await cache.set("test:catalog:org1:client", {"items": [1]}, ttl=10)
    await cache.set("test:other:key", {"status": "ok"}, ttl=10)

    # Delete pattern
    deleted = await cache.delete_pattern("test:catalog:*")
    assert deleted >= 2

    assert await cache.get("test:catalog:org1:admin") is None
    assert await cache.get("test:catalog:org1:client") is None
    # Other key untouched
    assert await cache.get("test:other:key") == {"status": "ok"}
