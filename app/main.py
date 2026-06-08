from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.mongodb import connect_to_mongo, close_mongo_connection
from app.api import auth, upload, chatbot, analytics, feedback, admin, reports, farmer, weather, plant_analysis
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Mount local plant images static files route
PLANT_IMAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "plant_images")
os.makedirs(PLANT_IMAGES_DIR, exist_ok=True)
app.mount("/data/plant_images", StaticFiles(directory=PLANT_IMAGES_DIR), name="plant_images")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    try:
        await connect_to_mongo()
    except Exception:
        import logging

        logging.exception(
            "MongoDB connection failed; login/register and DB-backed routes need Mongo running."
        )

@app.on_event("shutdown")
async def shutdown_event():
    await close_mongo_connection()

# Include Routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(upload.router, prefix=f"{settings.API_V1_STR}/upload", tags=["Upload"])
app.include_router(chatbot.router, prefix=f"{settings.API_V1_STR}/chat", tags=["Chatbot"])
app.include_router(analytics.router, prefix=f"{settings.API_V1_STR}/analytics", tags=["Analytics"])
app.include_router(feedback.router, prefix=f"{settings.API_V1_STR}/feedback", tags=["Feedback"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin"])
app.include_router(farmer.router, prefix=f"{settings.API_V1_STR}/farmer", tags=["Farmer"])
app.include_router(reports.router, prefix=f"{settings.API_V1_STR}/reports", tags=["Reports"])
app.include_router(weather.router, prefix=f"{settings.API_V1_STR}/weather", tags=["Weather"])
app.include_router(plant_analysis.router, prefix=f"{settings.API_V1_STR}/plant", tags=["Plant Analysis"])

@app.get("/")
async def root():
    return {"message": "Welcome to AGRINEXUS AI API", "status": "online"}
