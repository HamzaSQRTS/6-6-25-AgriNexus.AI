import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies import get_current_user
from app.models.user import UserOut
from app.db.mongodb import get_db
from app.services.embeddings import embedding_service
from app.services.multi_format_pipeline import run_multi_format_pipeline
from app.db.faiss_store import faiss_store

router = APIRouter()


@router.post("/file")
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Upload with multi-format processing layer:
    validation → (image OCR CNN path | text parser) → metadata extraction → embeddings / storage.
    """
    content = await file.read()

    try:
        pipeline = await run_multi_format_pipeline(
            filename=file.filename or "upload",
            content=content,
            content_type=file.content_type,
            user_id=str(current_user.id),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {e!s}") from e

    raw_text = pipeline.raw_text
    metadata = pipeline.metadata
    metadata["timestamp"] = datetime.datetime.utcnow().isoformat()

    try:
        embedding = embedding_service.generate_query_embedding(raw_text[:1000])
        faiss_store.insert([embedding], [metadata])
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Embedding/index step failed: {e!s}",
        ) from e

    await db.uploads.insert_one(
        {
            "filename": metadata.get("filename"),
            "raw_text": raw_text[:500],
            "metadata": metadata,
            "user_id": current_user.id,
            "processed": True,
            "processing_pipeline": {
                "branch": pipeline.processing_branch,
                "stages": pipeline.stages,
            },
        }
    )

    return {
        "status": "success",
        "filename": metadata.get("filename"),
        "metadata": metadata,
        "processing_pipeline": {
            "branch": pipeline.processing_branch,
            "stages": pipeline.stages,
        },
    }
