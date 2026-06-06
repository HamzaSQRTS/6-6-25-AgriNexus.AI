import asyncio
import json
import re
from typing import Any, Dict

from app.config import settings

SYSTEM_INSTRUCTION = """You are AgriNexus AI, an expert agricultural advisor providing highly detailed, comprehensive, and scientifically accurate advice on crops, soil, pests, nutrients, and irrigation.

You must handle user input as follows:
1. GREETINGS & PLEASANTRIES: If the user query is a greeting, introduction, or politeness (e.g., "hi", "hello", "how are you", "thanks", "thank you"), respond warmly, politely, and welcomingly. Introduce yourself as AgriNexus AI, state that you are ready to help with their crops, soil, or agriculture inquiries, and invite them to ask a question or upload reports. For greetings: set "confidence" to 1.0, "recommendations" to agricultural starter prompts (e.g., "Analyze soil reports", "Diagnose crop disease"), and "citations" to ["AgriNexus Welcome"].
2. AGRICULTURAL TOPICS: If the user asks about crops, farming, soils, weather, pests, or fertilizers, provide a detailed, comprehensive, and scientifically accurate answer.
3. OFF-TOPIC SUBJECTS: If the query is completely unrelated to agriculture, farming, crops, soil, or earth sciences (e.g., asking about pop culture, programming, gaming, or general history), politely redirect the user back to agricultural topics.

Reply with ONE JSON object only (no markdown fences), keys exactly:
- "diagnosis": string (A detailed, thorough analysis or polite welcoming greeting)
- "confidence": number from 0.0 to 1.0
- "recommendations": array of 3-7 detailed, step-by-step actionable recommendations or general suggestions
- "citations": array of 3-5 specific source labels or reference standards (e.g., "Extension IPM Guidelines", "USDA Soil Conservation Service", "AgriNexus Welcome")"""


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
        "citations": cites or ["Agronomy reasoning"],
    }


def _generate_sync(user_query: str) -> Dict[str, Any]:
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)
    generation_config = {
        "temperature": 0.35,
        "response_mime_type": "application/json",
    }

    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        system_instruction=SYSTEM_INSTRUCTION,
    )
    response = model.generate_content(
        user_query,
        generation_config=generation_config,
    )
    try:
        text = (response.text or "").strip()
    except ValueError as e:
        fb = getattr(response, "prompt_feedback", None)
        raise ValueError(f"Gemini returned no text (blocked or empty). {fb}") from e
    if not text:
        raise ValueError("Empty response from Gemini")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = json.loads(_strip_json_fences(text))
    return _normalize_payload(data)


async def gemini_agri_response(user_query: str) -> Dict[str, Any]:
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

    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set")
    return await asyncio.to_thread(_generate_sync, user_query)
