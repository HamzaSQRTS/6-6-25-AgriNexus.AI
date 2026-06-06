"""
Security validation for uploads: size, extension, filename safety, basic content checks.
"""
import os
import re
from typing import Optional, Tuple

# Align with architecture: validation before any heavy processing
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

ALLOWED_EXTENSIONS = frozenset({
    ".jpg", ".jpeg", ".png", ".webp",
    ".pdf",
    ".docx", ".doc",
    ".txt", ".csv",
})

# Suspicious patterns in decoded text payloads (XSS / injection hints — advisory layer)
_TEXT_SNIFF_PATTERNS = (
    re.compile(r"<\s*script", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),  # onclick=, onerror=, ...
)


def _safe_basename(filename: str) -> str:
    name = os.path.basename(filename or "").strip()
    if not name or name in (".", ".."):
        raise ValueError("Invalid filename")
    if ".." in filename.replace("\\", "/"):
        raise ValueError("Path traversal in filename is not allowed")
    return name


def _magic_hint(content: bytes, ext: str) -> Tuple[bool, str]:
    """Loose magic-byte check vs declared extension (reduces spoofed extensions)."""
    if len(content) < 4:
        return True, "too_short"
    head = content[:12]
    ext = ext.lower()
    if ext in (".jpg", ".jpeg"):
        ok = head[:3] == b"\xff\xd8\xff"
        return ok, "jpeg_magic"
    if ext == ".png":
        ok = head[:8] == b"\x89PNG\r\n\x1a\n"
        return ok, "png_magic"
    if ext == ".webp":
        ok = content[:4] == b"RIFF" and content[8:12] == b"WEBP"
        return ok, "webp_magic"
    if ext == ".pdf":
        ok = head[:4] == b"%PDF"
        return ok, "pdf_magic"
    if ext in (".docx",):
        # ZIP header PK\x03\x04
        ok = head[:2] == b"PK"
        return ok, "zip_magic_docx"
    return True, "skipped"


def validate_upload(filename: str, content: bytes, content_type: Optional[str] = None) -> dict:
    """
    Run security checks. Returns a small report dict for the pipeline trace.
    Raises ValueError with a user-safe message on failure.
    """
    if not content:
        raise ValueError("Empty file")

    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError(f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")

    safe_name = _safe_basename(filename)
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Extension {ext or '(none)'} is not allowed")

    magic_ok, magic_label = _magic_hint(content, ext)
    if not magic_ok:
        raise ValueError(
            f"File content does not match type {ext}. Possible spoofed extension ({magic_label})."
        )

    if ext in (".txt", ".csv"):
        try:
            sample = content[: min(len(content), 64_000)].decode("utf-8", errors="replace")
        except Exception:
            sample = ""
        for pat in _TEXT_SNIFF_PATTERNS:
            if pat.search(sample):
                raise ValueError("Content failed security validation (disallowed patterns in text).")

    return {
        "filename": safe_name,
        "extension": ext,
        "size_bytes": len(content),
        "content_type": content_type or "",
        "magic_check": magic_label,
    }
