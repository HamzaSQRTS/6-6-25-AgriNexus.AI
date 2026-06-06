from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter()


class FeedbackIn(BaseModel):
    message: str
    rating: int | None = None


@router.post("/")
async def submit_feedback(body: FeedbackIn):
    """Stub: accept feedback without persistence when MongoDB is not wired."""
    return {"status": "received", "detail": "Feedback recorded (stub; connect DB to persist)."}
