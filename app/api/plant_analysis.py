import os
import shutil
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from typing import Dict, Any, List

from app.dependencies import get_current_user
from app.models.user import UserOut
from app.db.sqlite_db import get_sqlite_conn, init_sqlite_db
from app.services.plant_service import PlantService

router = APIRouter()
logger = logging.getLogger(__name__)

# Ensure sqlite DB tables exist
init_sqlite_db()

# Directory to save uploaded plant images
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "plant_images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Helper to validate files
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB limit
ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png"}

def validate_image(file: UploadFile):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, JPEG, and PNG are allowed.")

@router.post("/upload-plant")
async def upload_plant(
    file: UploadFile = File(...),
    current_user: UserOut = Depends(get_current_user)
):
    """
    1. Validates and saves plant image.
    2. Performs species identification using Plant.id.
    3. Saves base upload details and returns details for next step.
    """
    validate_image(file)
    
    # Read file size validation
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds the 5MB limit.")
    
    # Reset file cursor for saving
    await file.seek(0)
    
    # Ensure unique safe filename
    ext = os.path.splitext(file.filename)[1]
    safe_name = f"plant_{current_user.id}_{int(datetime.utcnow().timestamp())}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, safe_name)
    
    with open(dest_path, "wb") as buffer:
        buffer.write(content)
        
    relative_image_path = f"data/plant_images/{safe_name}"

    # Perform Plant.id identification
    ident_res = await PlantService.identify_plant(content, file.filename)
    
    # Insert row into SQLite plant_uploads
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO plant_uploads (user_id, image_path, upload_date) VALUES (?, ?, ?);",
        (str(current_user.id), relative_image_path, datetime.utcnow().isoformat())
    )
    upload_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "upload_id": upload_id,
        "image_path": relative_image_path,
        "plant_name": ident_res["plant_name"],
        "scientific_name": ident_res["scientific_name"],
        "confidence": ident_res["confidence"],
        "alternatives": ident_res["alternatives"]
    }

@router.post("/analyze-plant")
async def analyze_plant(
    payload: Dict[str, Any],
    current_user: UserOut = Depends(get_current_user)
):
    """
    1. Performs OpenAI Vision analysis.
    2. Saves results to database.
    """
    upload_id = payload.get("upload_id")
    plant_name = payload.get("plant_name")
    scientific_name = payload.get("scientific_name", "")
    confidence = payload.get("confidence", 1.0)
    lang = payload.get("lang", "en")
    
    if not upload_id or not plant_name:
        raise HTTPException(status_code=400, detail="Missing required upload_id or plant_name.")
        
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    
    # Fetch upload row to verify path and ownership
    cursor.execute("SELECT * FROM plant_uploads WHERE id = ? AND user_id = ?;", (upload_id, str(current_user.id)))
    upload_row = cursor.fetchone()
    if not upload_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Plant upload record not found.")
        
    # Read the saved image bytes
    full_image_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), upload_row["image_path"])
    try:
        with open(full_image_path, "rb") as f:
            image_bytes = f.read()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to read stored image: {e}")
        
    # Call OpenAI vision API for health details
    health_res = await PlantService.analyze_health(image_bytes, plant_name, lang=lang)
    
    # Save results to sqlite database
    cursor.execute(
        """
        INSERT INTO plant_analysis (
            upload_id, plant_name, scientific_name, confidence, condition, 
            disease_detected, health_score, recommendations, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """,
        (
            upload_id, plant_name, scientific_name, confidence, 
            health_res["condition"], health_res["disease_detected"], 
            health_res["health_score"], health_res["recommendations"], 
            datetime.utcnow().isoformat()
        )
    )
    analysis_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "analysis_id": analysis_id,
        "upload_id": upload_id,
        "plant_name": plant_name,
        "scientific_name": scientific_name,
        "confidence": confidence,
        "condition": health_res["condition"],
        "disease_detected": health_res["disease_detected"],
        "health_score": health_res["health_score"],
        "recommendations": health_res["recommendations"]
    }

@router.get("/history")
async def get_history(current_user: UserOut = Depends(get_current_user)):
    """
    Returns list of previous plant analysis records.
    """
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT 
            pa.id, pa.plant_name, pa.scientific_name, pa.confidence, pa.condition, 
            pa.disease_detected, pa.health_score, pa.recommendations, pa.created_at,
            pu.image_path
        FROM plant_analysis pa
        JOIN plant_uploads pu ON pa.upload_id = pu.id
        WHERE pu.user_id = ?
        ORDER BY pa.created_at DESC;
        """,
        (str(current_user.id),)
    )
    rows = cursor.fetchall()
    conn.close()
    
    history = []
    for r in rows:
        history.append({
            "id": r["id"],
            "plant_name": r["plant_name"],
            "scientific_name": r["scientific_name"],
            "confidence": r["confidence"],
            "condition": r["condition"],
            "disease_detected": r["disease_detected"],
            "health_score": r["health_score"],
            "recommendations": r["recommendations"],
            "created_at": r["created_at"],
            "image_path": r["image_path"]
        })
    return history

@router.get("/analysis/{analysis_id}")
async def get_analysis(analysis_id: int, current_user: UserOut = Depends(get_current_user)):
    """
    Returns a specific plant analysis diagnostic report.
    """
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT 
            pa.id, pa.plant_name, pa.scientific_name, pa.confidence, pa.condition, 
            pa.disease_detected, pa.health_score, pa.recommendations, pa.created_at,
            pu.image_path
        FROM plant_analysis pa
        JOIN plant_uploads pu ON pa.upload_id = pu.id
        WHERE pa.id = ? AND pu.user_id = ?;
        """,
        (analysis_id, str(current_user.id))
    )
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
        
    return {
        "id": row["id"],
        "plant_name": row["plant_name"],
        "scientific_name": row["scientific_name"],
        "confidence": row["confidence"],
        "condition": row["condition"],
        "disease_detected": row["disease_detected"],
        "health_score": row["health_score"],
        "recommendations": row["recommendations"],
        "created_at": row["created_at"],
        "image_path": row["image_path"]
    }
