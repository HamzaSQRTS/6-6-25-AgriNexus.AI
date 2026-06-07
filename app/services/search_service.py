import os
import httpx
import logging
from typing import List
from app.config import settings

logger = logging.getLogger(__name__)

async def search(query: str) -> str:
    """Perform an agriculture‑focused web search.

    Currently uses the Tavily API (free tier) which returns a list of
    result objects with ``url`` and ``title`` keys. The function filters
    results to domains that are likely agriculture‑related and returns a
    markdown‑formatted snippet.
    """
    provider = getattr(settings, "SEARCH_API_PROVIDER", "tavily").lower()
    api_key = getattr(settings, "SEARCH_API_KEY", "").strip()
    if not api_key:
        logger.warning("Search API key not configured – returning empty result")
        return ""
    if provider == "tavily":
        url = "https://api.tavily.com/search"
        payload = {"query": query, "api_key": api_key, "max_results": 5}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            results: List[dict] = data.get("results", [])
            # Simple domain filter for agriculture‑related sites
            allowed = ["gov.pk", "agri", "faostat.org", "icrisat.org", "cgiar.org"]
            filtered = [
                r for r in results
                if any(domain in (r.get("url") or "") for domain in allowed)
            ]
            if not filtered:
                filtered = results[:3]
            lines = ["**Web Search Results:**"]
            for r in filtered:
                title = r.get("title", "").strip()
                url = r.get("url", "").strip()
                lines.append(f"- [{title}]({url})")
            return "\n".join(lines)
    else:
        logger.error(f"Unsupported search provider: {provider}")
        return ""
