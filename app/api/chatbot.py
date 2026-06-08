import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.config import settings
from app.dependencies import get_current_user
from app.models.user import UserOut
from app.db.mongodb import get_db
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter()
logger = logging.getLogger(__name__)


class AttachedDoc(BaseModel):
    filename: str
    text: str

class ChatQuery(BaseModel):
    query: str
    city: Optional[str] = None
    land_size: Optional[float] = None
    use_web_search: Optional[bool] = False
    selected_files: Optional[List[str]] = None
    active_docs: Optional[List[AttachedDoc]] = None


class ChatResponse(BaseModel):
    diagnosis: str
    confidence: float
    recommendations: List[str]
    citations: List[str]


@router.post("/query", response_model=ChatResponse)
async def chat_query(
    query_in: ChatQuery,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Agricultural Q&A via OpenRouter (OpenAI-compatible API)."""
    query = (query_in.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if not (settings.OPENROUTER_API_KEY or "").strip():
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY is not set. Add it to your .env (see .env.example).",
        )

    from app.services.api_control import is_chat_enabled
    from app.services.token_usage import get_usage_snapshot

    if not is_chat_enabled():
        raise HTTPException(status_code=503, detail="Chat API is disabled by administrator.")

    usage = get_usage_snapshot(settings.DAILY_TOKEN_LIMIT)
    if usage["limit_reached"]:
        raise HTTPException(
            status_code=429,
            detail=f"Daily token limit reached ({usage['tokens_used']}/{usage['daily_limit']}).",
        )

    try:
        from app.services.openrouter_chat import openrouter_agri_response
        from app.services.search_service import search
        from app.db.faiss_store import faiss_store
        from app.services.embeddings import embedding_service

        # Direct ChatGPT/Gemini style context injection if active documents are attached
        context_parts = []
        if query_in.active_docs:
            doc_texts = []
            for doc in query_in.active_docs:
                title = doc.filename
                text = doc.text
                if text:
                    doc_texts.append(f"Document source: {title}\nContent details: {text}")
            if doc_texts:
                context_parts.append("RELEVANT UPLOADED DOCUMENTS & CONTEXT:\n" + "\n---\n".join(doc_texts))
        else:
            # Search FAISS knowledge store for query context
            try:
                query_emb = embedding_service.generate_query_embedding(query)
                relevant_docs = faiss_store.search(query_emb, k=4)
                if relevant_docs:
                    doc_texts = []
                    for doc in relevant_docs:
                        # Filter for documents uploaded by the current user, or knowledge base entries (which have no user_id or a matching one)
                        doc_user_id = doc.get("user_id")
                        if not doc_user_id or str(doc_user_id) == str(current_user.id):
                            filename = doc.get("filename")
                            if query_in.selected_files and filename and filename not in query_in.selected_files:
                                continue
                            title = filename or doc.get("topic") or "Knowledge Base"
                            text = doc.get("text") or doc.get("ai_summary") or ""
                            if text:
                                doc_texts.append(f"Document source: {title}\nContent details: {text}")
                    if doc_texts:
                        context_parts.append("RELEVANT UPLOADED DOCUMENTS & CONTEXT:\n" + "\n---\n".join(doc_texts))
            except Exception as search_err:
                logger.warning(f"FAISS search failed: {search_err}")

        # Append context if present
        user_city = query_in.city or getattr(current_user, "city", None)
        user_acres = getattr(current_user, "acres", None) or query_in.land_size

        if user_city:
            context_parts.append(f"District/City: {user_city}")
        if user_acres:
            context_parts.append(f"Land Size: {user_acres} Acres")
        
        # Auto-fetch weather context if query is weather-related and city is available
        weather_keywords = ["weather", "rain", "temperature", "forecast", "humidity", "wind", "monsoon", "climate", "storm", "hot", "cold", "degree"]
        if user_city and any(k in query.lower() for k in weather_keywords):
            try:
                from app.api.weather import get_weather
                weather_info = await get_weather(city=user_city)
                if weather_info:
                    weather_desc = (
                        f"Current Weather in {user_city}: "
                        f"{weather_info.get('temperature')}°C, "
                        f"{weather_info.get('condition')} ({weather_info.get('description')}), "
                        f"Humidity: {weather_info.get('humidity')}%, "
                        f"Wind Speed: {weather_info.get('windSpeed')} m/s"
                    )
                    context_parts.append(f"WEATHER CONTEXT: {weather_desc}")
            except Exception as weather_err:
                logger.warning(f"Auto weather fetch failed: {weather_err}")
        
        full_query = query
        if context_parts:
            context_str = "\n\n".join(context_parts)
            full_query = f"[Context:\n{context_str}\n]\nUser Question: {query}"

        # First get LLM response
        res = await openrouter_agri_response(full_query)

        # If user requested web search, fetch and prepend results
        if getattr(query_in, "use_web_search", False):
            try:
                web_md = await search(query)
                if web_md:
                    # Append web results to the diagnosis for display
                    res["diagnosis"] = f"{web_md}\n\n{res.get('diagnosis', '')}"
            except Exception as e:
                logger.warning(f"Web search failed: {e}")

        # Save to chat history database
        try:
            await db.chat_history.insert_one({
                "user_id": current_user.id,
                "query": query,
                "response": res,
                "timestamp": datetime.utcnow()
            })
        except Exception as db_err:
            logger.warning(f"Failed to write to chat_history: {db_err}")

        return res
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("OpenRouter chat failed")
        msg = str(e).strip() or repr(e)
        typ = type(e).__name__
        raise HTTPException(
            status_code=502,
            detail=(
                f"Chat provider error ({typ}): {msg}. "
                f"Model={settings.OPENROUTER_MODEL!r}. "
                "Confirm OPENROUTER_API_KEY at https://openrouter.ai/keys and pick a model from https://openrouter.ai/models"
            ),
        ) from e


@router.get("/history")
async def get_chat_history(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """Retrieve past chat conversations for the logged in user."""
    try:
        cursor = db.chat_history.find({"user_id": current_user.id}).sort("timestamp", -1)
        docs = await cursor.to_list(length=100)
        
        history = []
        for doc in docs:
            history.append({
                "id": str(doc.get("_id")),
                "query": doc.get("query"),
                "response": doc.get("response"),
                "timestamp": doc.get("timestamp").isoformat() if doc.get("timestamp") else None
            })
        return history
    except Exception as e:
        logger.error(f"Failed to fetch chat history: {e}")
        return []
