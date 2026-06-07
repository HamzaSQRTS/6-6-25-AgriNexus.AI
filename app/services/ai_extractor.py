import json
import logging
import re
import httpx
from typing import Any, Dict, Optional
from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are an expert agricultural AI data extractor.
Analyze the provided document text and reply with a SINGLE JSON object ONLY. Do not include markdown formatting or backticks (no ```json fences).
Keys must be exactly:
- "report_type": string ("agriculture_soil", "geotechnical_soil", "weather", or "unknown")
- "confidence": float (0.0 to 1.0)
- "extracted_data": object
- "ai_summary": string (concise 2-3 sentences summary of the report)

Under "extracted_data", structure the metrics based on the "report_type":
1. For "agriculture_soil":
   - "nitrogen": {"value": float, "confidence": float}
   - "phosphorus": {"value": float, "confidence": float}
   - "potassium": {"value": float, "confidence": float}
   - "ph": {"value": float, "confidence": float}
2. For "geotechnical_soil":
   - "gravel": {"value": float, "confidence": float}
   - "sand": {"value": float, "confidence": float}
   - "silt_clay": {"value": float, "confidence": float}
   - "liquid_limit": {"value": float, "confidence": float}
   - "plastic_limit": {"value": float, "confidence": float}
   - "dry_density": {"value": float, "confidence": float}
   - "moisture": {"value": float, "confidence": float}
   - "cbr": {"value": float, "confidence": float}
   - "free_swell": {"value": float, "confidence": float}
3. For "weather":
   - "forecast": array of objects, each with:
     - "day": string (e.g., "Today", "THU", "FRI", etc.)
     - "condition": string (e.g., "Sunny", "Passing clouds", etc.)
     - "temp_high": integer
     - "temp_low": integer

Provide only valid numeric values for metrics (float/int). If a metric is not found in the text, set its value to null.
"""

def _strip_json_fences(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return t

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

async def _call_openrouter(text: str) -> Optional[Dict[str, Any]]:
    key = (settings.OPENROUTER_API_KEY or "").strip()
    if not key:
        return None
        
    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AgriNexus AI Extraction",
    }
    
    payload = {
        "model": settings.OPENROUTER_MODEL or "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": f"Document text to extract:\n\n{text}"}
        ],
        "temperature": 0.1,
    }
    
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(url, headers=headers, json=payload)
            if r.status_code == 200:
                body = r.json()
                choices = body.get("choices") or []
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    return _parse_json_from_text(content)
    except Exception as e:
        logger.warning(f"OpenRouter extraction call failed: {e}")
    return None

async def _call_gemini(text: str) -> Optional[Dict[str, Any]]:
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        return None
        
    try:
        import google.generativeai as genai
        genai.configure(api_key=key)
        
        generation_config = {
            "temperature": 0.1,
            "response_mime_type": "application/json",
        }
        
        model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL,
            system_instruction=SYSTEM_INSTRUCTION,
        )
        
        # Generativeai is sync, run in thread pool
        import asyncio
        response = await asyncio.to_thread(
            model.generate_content,
            f"Document text to extract:\n\n{text}",
            generation_config=generation_config
        )
        if response.text:
            return _parse_json_from_text(response.text)
    except Exception as e:
        logger.warning(f"Gemini extraction call failed: {e}")
    return None

class AIExtractor:
    async def extract_structured_data(self, text: str) -> Dict[str, Any]:
        """Classify and extract structured metrics from raw text via AI Model."""
        # 1. Try Gemini
        result = await _call_gemini(text)
        if result:
            logger.info("AI extraction succeeded using Gemini.")
            return result
            
        # 2. Try OpenRouter
        result = await _call_openrouter(text)
        if result:
            logger.info("AI extraction succeeded using OpenRouter.")
            return result
            
        # 3. Fallback to Local Classification & Parsing Services
        logger.warning("AI extraction failed/unavailable. Falling back to local regex services.")
        from app.services.classification_service import classification_service
        from app.services.extraction_service import extraction_service
        from app.services.metadata_extractor import metadata_extractor
        
        classification = classification_service.classify(text)
        report_type = classification["report_type"]
        confidence = classification["confidence"]
        extracted_data = extraction_service.extract_data(report_type, text)
        ai_summary = metadata_extractor.generate_ai_summary(report_type, extracted_data, text)
        
        return {
            "report_type": report_type,
            "confidence": confidence,
            "extracted_data": extracted_data,
            "ai_summary": ai_summary
        }

ai_extractor = AIExtractor()
