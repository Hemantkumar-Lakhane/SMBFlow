"""
core/redis_cache.py
===================
Real-time high-performance Redis cache with in-memory fallback.
Caches hot query results:
  - Tool connections & integration configurations
  - Workflow catalog entitlements & assignments
  - Workspace user profile / auth metadata
  - Copilot dynamic prompts & platform insights
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any, Optional

import structlog

log = structlog.get_logger()


class RedisCache:
    """
    Asynchronous Redis Key-Value Cache.
    Falls back gracefully to an in-memory TTL dictionary if Redis is unavailable.
    """

    def __init__(self):
        self._redis = None
        self._available = False
        self._memory_cache: dict[str, tuple[Any, float]] = {}

    async def connect(self) -> bool:
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            log.info("REDIS_URL not configured — Redis cache using in-memory fallback")
            self._available = False
            return False

        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2.5,
                socket_timeout=2.5,
            )
            await self._redis.ping()
            self._available = True
            log.info("Redis cache layer connected", url=redis_url.split("@")[-1])
            return True
        except Exception as e:
            log.warning("Redis cache connection failed — falling back to memory cache", error=str(e))
            self._available = False
            return False

    async def _ensure_client(self):
        if self._redis is None:
            await self.connect()
        return self._redis

    async def get(self, key: str) -> Optional[Any]:
        """Retrieve and deserialize a JSON-cached value."""
        client = await self._ensure_client()
        if self._available and client:
            try:
                raw = await client.get(key)
                if raw is not None:
                    return json.loads(raw)
            except Exception as e:
                log.debug("Redis cache get error, checking memory fallback", key=key, error=str(e))

        # In-memory fallback check
        entry = self._memory_cache.get(key)
        if entry:
            val, expires_at = entry
            if time.time() < expires_at:
                return val
            else:
                self._memory_cache.pop(key, None)
        return None

    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """Serialize value as JSON and store with a TTL (seconds)."""
        serialized = json.dumps(value, default=str)

        # Always update memory fallback
        self._memory_cache[key] = (value, time.time() + ttl)

        client = await self._ensure_client()
        if self._available and client:
            try:
                await client.set(key, serialized, ex=ttl)
                return True
            except Exception as e:
                log.debug("Redis cache set error, stored in memory fallback", key=key, error=str(e))
                return False
        return True

    async def delete(self, key: str) -> bool:
        """Invalidate a specific cache key."""
        self._memory_cache.pop(key, None)
        client = await self._ensure_client()
        if self._available and client:
            try:
                await client.delete(key)
                return True
            except Exception as e:
                log.debug("Redis cache delete error", key=key, error=str(e))
        return True

    async def delete_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching a wildcard pattern (e.g. 'cache:connections:*')."""
        deleted_count = 0

        # Purge from memory cache
        matching_mem = [k for k in self._memory_cache if self._pattern_match(k, pattern)]
        for k in matching_mem:
            self._memory_cache.pop(k, None)
            deleted_count += 1

        client = await self._ensure_client()
        if self._available and client:
            try:
                cursor = 0
                keys_to_del = []
                while True:
                    cursor, keys = await client.scan(cursor=cursor, match=pattern, count=100)
                    if keys:
                        keys_to_del.extend(keys)
                    if cursor == 0:
                        break
                if keys_to_del:
                    deleted_count += await client.delete(*keys_to_del)
            except Exception as e:
                log.debug("Redis scan/delete pattern error", pattern=pattern, error=str(e))

        return deleted_count

    @staticmethod
    def _pattern_match(key: str, pattern: str) -> bool:
        if pattern == "*":
            return True
        if pattern.endswith("*"):
            return key.startswith(pattern[:-1])
        if pattern.startswith("*"):
            return key.endswith(pattern[1:])
        return key == pattern

    async def ping(self) -> bool:
        client = await self._ensure_client()
        if self._available and client:
            try:
                return bool(await client.ping())
            except Exception:
                return False
        return False

    async def close(self):
        if self._redis:
            try:
                await self._redis.aclose()
            except Exception:
                pass
        self._available = False


cache = RedisCache()
