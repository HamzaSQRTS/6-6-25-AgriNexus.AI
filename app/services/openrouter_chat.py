import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Union

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are AgriNexus AI, an expert agricultural advisor providing highly detailed, comprehensive, and scientifically accurate advice on crops, soil, pests, nutrients, and irrigation.

You must handle user input as follows:
1. GREETINGS & PLEASANTRIES: If the user query is a greeting, introduction, or politeness (e.g., "hi", "hello", "how are you", "thanks", "thank you"), respond warmly, politely, and welcomingly. Introduce yourself as AgriNexus AI, state that you are ready to help with their crops, soil, or agriculture inquiries, and invite them to ask a question or upload reports. For greetings: set "confidence" to 1.0, "recommendations" to agricultural starter prompts (e.g., "Analyze soil reports", "Diagnose crop disease"), and "citations" to ["AgriNexus Welcome"].
2. AGRICULTURAL TOPICS & UPLOADED DOCUMENTS: If the user asks about crops, farming, soils, weather, pests, or fertilizers, OR asks questions about their uploaded document/file (when document context is provided in the prompt), provide a detailed, comprehensive, and scientifically accurate answer based on the query and any provided context.
3. OFF-TOPIC SUBJECTS: If the query is completely unrelated to agriculture, farming, crops, soil, or earth sciences (and is NOT asking about the provided context or uploaded documents), politely redirect the user back to agricultural topics.

Reply with ONE JSON object only (no markdown code fences), keys exactly:
- "diagnosis": string (A detailed, thorough analysis or polite welcoming greeting)
- "confidence": number from 0.0 to 1.0
- "recommendations": array of 3-7 detailed, step-by-step actionable recommendations or general suggestions
- "citations": array of 3-5 specific source labels or reference standards (e.g., "Extension IPM Guidelines", "USDA Soil Conservation Service", "AgriNexus Welcome")"""

# HTTP statuses worth retrying or trying the next model
_RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}

DEFAULT_FALLBACK_MODELS = (
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.1-8b-instruct:free",
)


def _fmt_exc(exc: BaseException) -> str:
    msg = str(exc).strip()
    if msg:
        return msg
    name = type(exc).__name__
    if exc.args:
        return f"{name}: {exc.args!r}"
    return name


def _model_candidates() -> List[str]:
    primary = (settings.OPENROUTER_MODEL or "").strip()
    extra = (getattr(settings, "OPENROUTER_FALLBACK_MODELS", None) or "").strip()
    fallbacks = [m.strip() for m in extra.split(",") if m.strip()] if extra else list(DEFAULT_FALLBACK_MODELS)
    seen: set[str] = set()
    out: List[str] = []
    for m in [primary, *fallbacks]:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out or list(DEFAULT_FALLBACK_MODELS)


def _strip_json_fences(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return t


def _normalize_payload(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Model response is not a JSON object")
    diagnosis = str(data.get("diagnosis", "")).strip() or "No diagnosis returned."
    recs = data.get("recommendations") or []
    cites = data.get("citations") or []
    if not isinstance(recs, list):
        recs = [str(recs)]
    if not isinstance(cites, list):
        cites = [str(cites)]
    recs = [str(x) for x in recs if str(x).strip()]
    cites = [str(x) for x in cites if str(x).strip()]
    try:
        conf = float(data.get("confidence", 0.7))
    except (TypeError, ValueError):
        conf = 0.7
    conf = max(0.0, min(1.0, conf))
    return {
        "diagnosis": diagnosis,
        "confidence": conf,
        "recommendations": recs or ["Review field conditions and local extension advice."],
        "citations": cites or ["OpenRouter / model output"],
    }


def _parse_json_from_text(raw: str) -> Dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("Empty model response")
    for candidate in (text, _strip_json_fences(text)):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in model reply (snippet): {text[:280]!r}") from e
    raise ValueError(f"Could not parse JSON from model reply: {text[:280]!r}")


def _extract_openrouter_error(status: int, text: str) -> str:
    if not text:
        return f"HTTP {status}"
    try:
        data = json.loads(text)
        err = data.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or err.get("code") or err)
        if isinstance(err, str):
            return err
    except json.JSONDecodeError:
        pass
    return text[:800]


def _message_content_to_text(content: Union[str, None, List, Dict]) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if "text" in block:
                    parts.append(str(block["text"]))
        return "".join(parts).strip()
    if isinstance(content, dict):
        return str(content.get("text") or content.get("content") or "")
    return str(content)


async def _call_openrouter_once(
    client: httpx.AsyncClient,
    *,
    url: str,
    headers: dict,
    model: str,
    user_query: str,
) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": user_query},
        ],
        "temperature": 0.35,
        "max_tokens": int(getattr(settings, "MAX_TOKENS_PER_CHAT", 1024) or 1024),
    }

    last_err: Exception | None = None
    for attempt in range(2):
        try:
            r = await client.post(url, headers=headers, json=payload)
        except httpx.TimeoutException as e:
            last_err = RuntimeError(f"OpenRouter timed out for model {model!r}")
            if attempt == 0:
                await asyncio.sleep(1.5)
                continue
            raise last_err from e
        except httpx.RequestError as e:
            raise RuntimeError(f"Network error calling OpenRouter: {_fmt_exc(e)}") from e

        if r.status_code in _RETRYABLE_STATUS:
            detail = _extract_openrouter_error(r.status_code, r.text)
            last_err = RuntimeError(f"OpenRouter HTTP {r.status_code} ({model}): {detail}")
            if attempt == 0 and r.status_code in (502, 503, 504, 429):
                await asyncio.sleep(2.0)
                continue
            raise last_err

        if r.status_code >= 400:
            detail = _extract_openrouter_error(r.status_code, r.text)
            raise RuntimeError(f"OpenRouter HTTP {r.status_code} ({model}): {detail}")

        try:
            body = r.json()
        except json.JSONDecodeError as e:
            raise RuntimeError(f"OpenRouter returned non-JSON body: {r.text[:400]!r}") from e

        usage = body.get("usage") or {}
        if usage:
            from app.services.token_usage import record_usage

            record_usage(
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
            )

        choices = body.get("choices") or []
        if not choices:
            raise RuntimeError(
                f"OpenRouter returned no choices for {model}. Snippet: {json.dumps(body)[:400]}"
            )

        message = choices[0].get("message") or {}
        text_out = _message_content_to_text(message.get("content"))
        if text_out:
            return text_out

        finish = choices[0].get("finish_reason")
        raise RuntimeError(
            f"Empty response from {model} (finish_reason={finish!r})"
        )

    if last_err:
        raise last_err
    raise RuntimeError(f"OpenRouter failed for model {model!r}")


async def openrouter_agri_response(user_query: str) -> Dict[str, Any]:
    # Local greeting & pleasantry intercept
    query_clean = user_query.strip().lower().rstrip('.!?')
    greetings = {"hello", "hi", "hey", "good morning", "good afternoon", "good evening", "how are you", "greetings", "yo"}
    if query_clean in greetings or any(query_clean.startswith(g) and len(query_clean) <= len(g)+4 for g in greetings) or query_clean in {"thanks", "thank you", "thanks!"}:
        return {
            "diagnosis": "Hello! I am AgriNexus AI, your agricultural advisor. I am here to help you with any questions about crops, soil reports, pests, fertilizer schedules, or weather forecasts. How can I assist you with your farming needs today?",
            "confidence": 1.0,
            "recommendations": [
                "Ask about soil nutrient needs",
                "Diagnose a plant disease from symptoms",
                "Understand weather impacts on irrigation"
            ],
            "citations": ["AgriNexus Assistant Guidelines"]
        }

    key = (settings.OPENROUTER_API_KEY or "").strip()
    if not key:
        raise ValueError("OPENROUTER_API_KEY is not set")

    base = settings.OPENROUTER_BASE_URL.rstrip("/")
    url = f"{base}/chat/completions"
    referer = (getattr(settings, "OPENROUTER_HTTP_REFERER", None) or "http://localhost:3000").strip()

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "AgriNexus AI",
    }

    models = _model_candidates()
    errors: List[str] = []

    timeout = httpx.Timeout(
        connect=20.0,
        read=float(getattr(settings, "OPENROUTER_READ_TIMEOUT", 90.0)),
        write=30.0,
        pool=20.0,
    )

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for model in models:
            try:
                logger.info("OpenRouter request model=%s", model)
                text_out = await _call_openrouter_once(
                    client,
                    url=url,
                    headers=headers,
                    model=model,
                    user_query=user_query,
                )
                data = _parse_json_from_text(text_out)
                return _normalize_payload(data)
            except Exception as e:
                msg = _fmt_exc(e)
                logger.warning("OpenRouter model %s failed: %s", model, msg)
                errors.append(f"{model}: {msg}")

    hint = (
        "OpenRouter gateway timeout (504) usually means the provider was slow or overloaded. "
        "Set OPENROUTER_MODEL=openai/gpt-4o-mini in .env or add OPENROUTER_FALLBACK_MODELS."
    )
    raise RuntimeError(
        f"All OpenRouter models failed. Tried: {', '.join(models)}. "
        f"Errors: {' | '.join(errors[:3])}. {hint}"
    )
