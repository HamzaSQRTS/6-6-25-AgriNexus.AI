from datetime import datetime, time, timedelta
from fastapi import APIRouter, Depends
from app.dependencies import check_admin
from app.db.mongodb import get_db
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter()

@router.get("/system")
async def get_system_analytics(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin=Depends(check_admin)
):
    """Fetch system-wide analytics for admin dashboard."""
    user_count = await db.users.count_documents({})
    farmer_count = await db.users.count_documents({"role": "farmer"})
    upload_count = await db.uploads.count_documents({})
    
    # Calculate queries today
    today_start = datetime.combine(datetime.utcnow().date(), time.min)
    queries_today = await db.chat_history.count_documents({"timestamp": {"$gte": today_start}})
    
    # Calculate daily queries trend for the last 30 days
    trends = []
    for i in range(29, -1, -1):
        day = datetime.utcnow().date() - timedelta(days=i)
        day_start = datetime.combine(day, time.min)
        day_end = datetime.combine(day, time.max)
        count = await db.chat_history.count_documents({"timestamp": {"$gte": day_start, "$lte": day_end}})
        trends.append({"day": day.strftime("%b %d"), "queries": count})

    # Retrieve all users for the dashboard
    users_list = []
    cursor = db.users.find({})
    async for u in cursor:
        users_list.append({
            "id": str(u.get("_id")),
            "name": u.get("full_name") or "Unnamed User",
            "email": u.get("email"),
            "role": u.get("role") or "farmer",
            "date": u.get("created_at").strftime("%Y-%m-%d") if u.get("created_at") else "2026-05-26",
            "status": "Active" if u.get("is_active", True) else "Inactive"
        })

    return {
        "summary": {
            "total_users": user_count,
            "active_farmers": farmer_count,
            "queries_today": queries_today,
            "files_processed": upload_count
        },
        "trends": trends,
        "users": users_list
    }
