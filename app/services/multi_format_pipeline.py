"""
Multi-format processing layer (upload architecture):

1. Validation (security check)
2. Branch: Image OCR (CNN model path) | Text parser (PDF/DOCX/TXT/CSV/DOC)
3. Metadata extraction
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.image_ocr_cnn import image_ocr_cnn_pipeline
from app.services.ai_extractor import ai_extractor
from app.services.text_parser import text_parser_service
from app.services.upload_validation import validate_upload


@dataclass
class MultiFormatPipelineResult:
    raw_text: str
    metadata: Dict[str, Any]
    stages: List[Dict[str, str]] = field(default_factory=list)
    processing_branch: str = ""


def _stage(name: str, status: str, detail: str = "") -> Dict[str, str]:
    return {"name": name, "status": status, "detail": detail}


async def run_multi_format_pipeline(
    *,
    filename: str,
    content: bytes,
    content_type: Optional[str],
    user_id: str,
) -> MultiFormatPipelineResult:
    stages: List[Dict[str, str]] = []

    try:
        validation_report = validate_upload(filename, content, content_type)
        stages.append(
            _stage(
                "validation_security_check",
                "ok",
                f"size={validation_report['size_bytes']}, ext={validation_report['extension']}, magic={validation_report['magic_check']}",
            )
        )
        safe_filename = validation_report["filename"]
    except ValueError as e:
        stages.append(_stage("validation_security_check", "error", str(e)))
        raise

    ext = os.path.splitext(safe_filename)[1].lower()
    branch = ""
    raw_text = ""

    if image_ocr_cnn_pipeline.supports(safe_filename):
        branch = "image_ocr_cnn"
        try:
            raw_text = await image_ocr_cnn_pipeline.extract_text(content, safe_filename)
            stages.append(
                _stage(
                    "image_ocr_cnn",
                    "ok",
                    "Image OCR (RapidOCR / EasyOCR)",
                )
            )
        except Exception as e:
            stages.append(_stage("image_ocr_cnn", "error", str(e)))
            raise
    else:
        branch = "text_parser"
        try:
            raw_text = await text_parser_service.parse(content, safe_filename)
            stages.append(
                _stage(
                    "text_parser_pdf_docx_txt_csv",
                    "ok",
                    f"parsed extension {ext}",
                )
            )
        except Exception as e:
            stages.append(_stage("text_parser_pdf_docx_txt_csv", "error", str(e)))
            raise

    if not (raw_text or "").strip():
        stages.append(_stage("content_quality", "error", "No extractable text"))
        raise ValueError("No text could be extracted from this file")

    # Save the raw text to a notepad text file on disk (.txt)
    try:
        raw_uploads_dir = os.path.join("data", "raw_uploads")
        os.makedirs(raw_uploads_dir, exist_ok=True)
        txt_filename = f"{os.path.splitext(safe_filename)[0]}.txt"
        filepath = os.path.join(raw_uploads_dir, txt_filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(raw_text)
    except Exception as e:
        import logging
        logging.warning(f"Failed to save raw text file: {e}")

    try:
        ai_res = await ai_extractor.extract_structured_data(raw_text)
        meta = {
            "report_type": ai_res.get("report_type", "unknown"),
            "confidence": ai_res.get("confidence", 0.0),
            "extracted_data": ai_res.get("extracted_data", {}),
            "ai_summary": ai_res.get("ai_summary", "No summary generated."),
            "raw_json": ai_res.get("extracted_data", {}),
            "filename": safe_filename,
            "user_id": user_id,
            "processing_branch": branch,
            "timestamp": None
        }
        stages.append(_stage("metadata_extraction", "ok", "AI extraction + classification"))
    except Exception as e:
        stages.append(_stage("metadata_extraction", "error", str(e)))
        raise

    return MultiFormatPipelineResult(
        raw_text=raw_text.strip(),
        metadata=meta,
        stages=stages,
        processing_branch=branch,
    )
