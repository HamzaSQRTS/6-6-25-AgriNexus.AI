from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.user import UserOut
from app.db.mongodb import get_db
from app.services.farmer_analytics import build_farmer_analytics
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter()


@router.get("/analytics")
async def get_farmer_analytics(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Dashboard metrics and charts derived from this farmer's uploaded files
    (metadata + stored text snippets).
    """
    uid = current_user.id
    cursor = db.uploads.find({"user_id": uid})
    docs = await cursor.to_list(length=200)
    return build_farmer_analytics(docs)
