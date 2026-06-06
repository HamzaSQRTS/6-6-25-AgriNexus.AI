"""Health checks and status payload for the admin dashboard."""
from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.db.mongodb import db_instance
from app.services.api_control import get_control_state, is_chat_enabled
from app.services.token_usage import get_usage_snapshot

logger = logging.getLogger(__name__)


async def _check_database() -> dict:
    if db_instance.is_mock:
        return {
            "status": "mock",
            "active": False,
            "label": "Mock (MongoDB unavailable)",
            "database_name": settings.DATABASE_NAME,
        }
    if not db_instance.client:
        return {
            "status": "inactive",
            "active": False,
            "label": "Not connected",
            "database_name": settings.DATABASE_NAME,
        }
    try:
        await db_instance.client.admin.command("ping")
        return {
            "status": "active",
            "active": True,
            "label": "Active",
            "database_name": settings.DATABASE_NAME,
        }
    except Exception as e:
        logger.warning("Database ping failed: %s", e)
        return {
            "status": "inactive",
            "active": False,
            "label": f"Unreachable: {e}",
            "database_name": settings.DATABASE_NAME,
        }


async def _probe_openrouter_key() -> tuple[bool, str]:
    key = (settings.OPENROUTER_API_KEY or "").strip()
    if not key:
        return False, "OPENROUTER_API_KEY is not configured"
    base = settings.OPENROUTER_BASE_URL.rstrip("/")
    url = f"{base}/models"
    headers = {
        "Authorization": f"Bearer {key}",
        "HTTP-Referer": (settings.OPENROUTER_HTTP_REFERER or "http://localhost:3000").strip(),
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0), follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
        if r.status_code == 200:
            return True, "Operational"
        detail = (r.text or "")[:200]
        return False, f"HTTP {r.status_code}: {detail}"
    except Exception as e:
        return False, str(e)


async def _probe_chatbot() -> tuple[bool, str]:
    if not is_chat_enabled():
        return False, "Chat API disabled by admin"
    key = (settings.OPENROUTER_API_KEY or "").strip()
    if not key:
        return False, "API key missing"
    usage = get_usage_snapshot(settings.DAILY_TOKEN_LIMIT)
    if usage["limit_reached"]:
        return False, "Daily token limit reached"
    base = settings.OPENROUTER_BASE_URL.rstrip("/")
    url = f"{base}/chat/completions"
    model = (settings.OPENROUTER_MODEL or "openai/gpt-4o-mini").strip()
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": (settings.OPENROUTER_HTTP_REFERER or "http://localhost:3000").strip(),
        "X-Title": "AgriNexus AI Health Check",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 8,
        "temperature": 0,
    }
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, read=45.0),
            follow_redirects=True,
        ) as client:
            r = await client.post(url, headers=headers, json=payload)
        if r.status_code >= 400:
            return False, f"HTTP {r.status_code}"
        body = r.json()
        choices = body.get("choices") or []
        if not choices:
            return False, "No response from model"
        from app.services.token_usage import record_usage

        u = body.get("usage") or {}
        record_usage(
            prompt_tokens=u.get("prompt_tokens", 0),
            completion_tokens=u.get("completion_tokens", 0),
            total_tokens=u.get("total_tokens", 0),
        )
        return True, "Working"
    except Exception as e:
        return False, str(e)


async def build_admin_status() -> dict:
    db_info = await _check_database()
    key_ok, key_detail = await _probe_openrouter_key()
    chat_ok, chat_detail = await _probe_chatbot()
    token_info = get_usage_snapshot(settings.DAILY_TOKEN_LIMIT)
    control = get_control_state()

    api_status = "online"
    if not control.get("chat_api_enabled", True):
        api_status = "restricted"
    elif not key_ok or not chat_ok:
        api_status = "degraded"

    overall_online = db_info["active"] or db_info["status"] == "mock"
    if token_info["limit_reached"]:
        overall_online = False

    return {
        "api": {
            "status": api_status,
            "operational": api_status == "online",
            "version": settings.VERSION,
            "base_path": settings.API_V1_STR,
        },
        "api_control": control,
        "database": db_info,
        "api_key": {
            "configured": bool((settings.OPENROUTER_API_KEY or "").strip()),
            "operational": key_ok,
            "detail": key_detail,
            "model": settings.OPENROUTER_MODEL,
        },
        "chatbot": {
            "working": chat_ok,
            "detail": chat_detail,
            "enabled": control.get("chat_api_enabled", True),
        },
        "token_usage": token_info,
        "system_online": overall_online and (key_ok or not (settings.OPENROUTER_API_KEY or "").strip()),
    }
