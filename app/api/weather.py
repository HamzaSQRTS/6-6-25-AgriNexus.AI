"""
Weather proxy — fetches live data from OpenWeatherMap and normalises it
for the Smart Agronomy dashboard.

GET /api/v1/weather?city=<name>

Response (normalised):
{
  "city": "Lahore",
  "country": "PK",
  "temperature": 31.2,
  "feelsLike": 33.8,
  "humidity": 64,
  "rainfall": 0.0,          # mm in the last hour
  "windSpeed": 3.4,         # m/s
  "windDeg": 200,
  "uvIndex": 7.2,           # best-effort
  "condition": "Haze",
  "icon": "50d",
  "sunrise": 1717700000,
  "sunset":  1717749000,
  "cloudCover": 40,
  "rawTimestamp": 1717712345
}

If no key is configured, returns 503 with a clear error so the frontend
can show a friendly "weather unavailable" state.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"


def _normalise(payload: Dict[str, Any], current_extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Turn the raw OpenWeatherMap `/weather` payload into our flat shape."""
    main = payload.get("main") or {}
    wind = payload.get("wind") or {}
    clouds = payload.get("clouds") or {}
    rain = payload.get("rain") or {}
    weather_list = payload.get("weather") or []
    first = weather_list[0] if weather_list else {}

    # Try the one-call "current" payload for uv (only available on paid plans,
    # but we accept it if the caller passes it in).
    uv = None
    if current_extra and "uvi" in current_extra:
        uv = current_extra.get("uvi")

    # Rainfall: prefer rain.1h, fall back to rain.3h / 3 for an average per-hour figure
    rainfall = 0.0
    if isinstance(rain, dict):
        if "1h" in rain:
            rainfall = float(rain["1h"])
        elif "3h" in rain:
            rainfall = float(rain["3h"]) / 3.0

    return {
        "city":        payload.get("name"),
        "country":     (payload.get("sys") or {}).get("country"),
        "temperature": main.get("temp"),
        "feelsLike":   main.get("feels_like"),
        "humidity":    main.get("humidity"),
        "pressure":    main.get("pressure"),
        "rainfall":    round(rainfall, 2),
        "windSpeed":   wind.get("speed"),
        "windDeg":     wind.get("deg"),
        "uvIndex":     uv,
        "condition":   first.get("main", "Unknown"),
        "description": first.get("description", ""),
        "icon":        first.get("icon"),
        "sunrise":     (payload.get("sys") or {}).get("sunrise"),
        "sunset":      (payload.get("sys") or {}).get("sunset"),
        "cloudCover":  clouds.get("all"),
        "rawTimestamp": int(payload.get("dt") or time.time()),
    }


@router.get("")
async def get_weather(city: str = Query(..., min_length=1, max_length=120)) -> Dict[str, Any]:
    api_key = settings.OPENWEATHER_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENWEATHER_API_KEY is not configured on the server. "
                   "Add it to .env and restart the API.",
        )

    params = {"q": city, "appid": api_key, "units": "metric"}
    url = f"{OPENWEATHER_BASE}/weather"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, params=params)
    except httpx.HTTPError as exc:
        logger.exception("OpenWeatherMap request failed")
        raise HTTPException(status_code=502, detail=f"Upstream weather service unreachable: {exc}")

    if r.status_code == 404:
        raise HTTPException(status_code=404, detail=f"City '{city}' not found.")
    if r.status_code == 401:
        raise HTTPException(status_code=502, detail="OpenWeatherMap rejected the API key (401).")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"OpenWeatherMap returned {r.status_code}: {r.text[:200]}")

    return _normalise(r.json())
