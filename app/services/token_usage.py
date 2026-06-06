"""In-process daily token usage tracking for admin dashboard."""
from __future__ import annotations

from datetime import date
from threading import Lock

_lock = Lock()
_day: date | None = None
_prompt_tokens: int = 0
_completion_tokens: int = 0
_total_tokens: int = 0
_request_count: int = 0


def record_usage(*, prompt_tokens: int = 0, completion_tokens: int = 0, total_tokens: int = 0) -> None:
    global _day, _prompt_tokens, _completion_tokens, _total_tokens, _request_count
    today = date.today()
    with _lock:
        if _day != today:
            _day = today
            _prompt_tokens = 0
            _completion_tokens = 0
            _total_tokens = 0
            _request_count = 0
        _prompt_tokens += max(0, int(prompt_tokens or 0))
        _completion_tokens += max(0, int(completion_tokens or 0))
        if total_tokens:
            _total_tokens += max(0, int(total_tokens))
        else:
            _total_tokens += max(0, int(prompt_tokens or 0) + int(completion_tokens or 0))
        _request_count += 1


def get_usage_snapshot(daily_limit: int) -> dict:
    today = date.today()
    with _lock:
        if _day != today:
            used = 0
            prompt = 0
            completion = 0
            requests = 0
        else:
            used = _total_tokens
            prompt = _prompt_tokens
            completion = _completion_tokens
            requests = _request_count
    limit = max(1, int(daily_limit or 1))
    pct = round(min(100.0, (used / limit) * 100.0), 1)
    return {
        "daily_limit": limit,
        "tokens_used": used,
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "request_count": requests,
        "percent_reached": pct,
        "limit_reached": used >= limit,
    }
