"""Runtime API enable/disable flag for admin control."""
from threading import Lock

_lock = Lock()
_chat_enabled: bool = True


def is_chat_enabled() -> bool:
    with _lock:
        return _chat_enabled


def set_chat_enabled(enabled: bool) -> bool:
    global _chat_enabled
    with _lock:
        _chat_enabled = bool(enabled)
        return _chat_enabled


def get_control_state() -> dict:
    with _lock:
        return {"chat_api_enabled": _chat_enabled}
