"""
api/dependencies.py
===================
FastAPI dependency injection: DB sessions, authenticated user context.
Import these into route modules instead of repeating the boilerplate.

CONSTANT — do not modify for business customization.
"""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import TokenData, get_current_user, require_admin, require_any_auth
from core.database import get_db
from core.state_manager import StateManager


async def get_state_manager(
    db: AsyncSession = Depends(get_db),
) -> StateManager:
    """Yield a request-scoped StateManager backed by the request DB session."""
    return StateManager(session=db)


async def get_admin_user(
    current_user: TokenData = Depends(require_admin),
) -> TokenData:
    """Shorthand: require super_admin role."""
    return current_user


async def get_auth_user(
    current_user: TokenData = Depends(require_any_auth),
) -> TokenData:
    """Shorthand: require any authenticated user."""
    return current_user


# Re-export for convenience so callers only need to import from here
__all__ = [
    "get_db",
    "get_state_manager",
    "get_admin_user",
    "get_auth_user",
    "get_current_user",
    "require_admin",
    "require_any_auth",
]