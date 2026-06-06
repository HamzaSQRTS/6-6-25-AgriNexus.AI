from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies import check_admin
from app.services.admin_status import build_admin_status
from app.services.api_control import set_chat_enabled
from app.db.mongodb import get_db
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter()


@router.get("/ping")
async def admin_ping(_admin=Depends(check_admin)):
    return {"status": "ok", "role": "admin"}


@router.get("/status")
async def admin_status(_admin=Depends(check_admin)):
    """System health: API, database, API key, chatbot, token usage."""
    return await build_admin_status()


class ApiControlUpdate(BaseModel):
    chat_api_enabled: bool


@router.post("/api-control")
async def update_api_control(
    body: ApiControlUpdate,
    _admin=Depends(check_admin),
):
    """Enable or disable the chat API at runtime."""
    enabled = set_chat_enabled(body.chat_api_enabled)
    status = await build_admin_status()
    return {"chat_api_enabled": enabled, "status": status}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _admin=Depends(check_admin),
):
    """Delete a user account by ID."""
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    if user.get("role") == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts cannot be deleted."
        )
    
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return {"message": "User deleted successfully", "user_id": user_id}


class AiParamsUpdate(BaseModel):
    temperature: float
    retrieval_bounds: int
    system_prompt: str


@router.get("/ai-params")
async def get_ai_params(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _admin=Depends(check_admin),
):
    """Retrieve AI parameters."""
    params = await db.ai_params.find_one({"type": "current"})
    if not params:
        return {
            "temperature": 0.35,
            "retrieval_bounds": 5,
            "system_prompt": "You are a professional agronomist AI assistant."
        }
    return {
        "temperature": params.get("temperature", 0.35),
        "retrieval_bounds": params.get("retrieval_bounds", 5),
        "system_prompt": params.get("system_prompt", "You are a professional agronomist AI assistant.")
    }


@router.post("/ai-params")
async def update_ai_params(
    body: AiParamsUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _admin=Depends(check_admin),
):
    """Update AI parameters."""
    await db.ai_params.update_one(
        {"type": "current"},
        {"$set": {
            "temperature": body.temperature,
            "retrieval_bounds": body.retrieval_bounds,
            "system_prompt": body.system_prompt
        }},
        upsert=True
    )
    return {"message": "AI parameters updated successfully", "params": body}
