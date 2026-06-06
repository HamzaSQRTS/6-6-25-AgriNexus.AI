import json
import asyncio
from typing import Dict, Any, List
from openai import AsyncOpenAI
from app.config import settings

SYSTEM_INSTRUCTION = """You are AgriNexus AI, an expert agricultural advisor providing highly detailed, comprehensive, and scientifically accurate advice on crops, soil, pests, nutrients, and irrigation.
Reply with ONE JSON object only, keys:
- "diagnosis": string (A detailed, thorough analysis, typically 2-3 comprehensive paragraphs explaining the diagnosis, the underlying causes, soil/crop chemistry, and biological mechanisms)
- "confidence": number (0.0-1.0)
- "recommendations": array of detailed step-by-step actionable recommendations
- "citations": array of specific source labels or reference standards"""

async def grok_agri_response(user_query: str) -> Dict[str, Any]:
    if not settings.GROK_API_KEY:
        raise ValueError("GROK_API_KEY is not set")

    client = AsyncOpenAI(
        api_key=settings.GROK_API_KEY,
        base_url=settings.GROK_BASE_URL,
    )

    response = await client.chat.completions.create(
        model=settings.GROK_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": user_query}
        ],
        response_format={"type": "json_object"},
        temperature=0.3
    )

    try:
        content = response.choices[0].message.content
        data = json.loads(content)
        
        # Normalize fields
        return {
            "diagnosis": data.get("diagnosis", "No diagnosis provided."),
            "confidence": float(data.get("confidence", 0.8)),
            "recommendations": data.get("recommendations", []),
            "citations": data.get("citations", ["xAI / Grok-beta"])
        }
    except Exception as e:
        raise ValueError(f"Failed to parse Grok response: {str(e)}")
