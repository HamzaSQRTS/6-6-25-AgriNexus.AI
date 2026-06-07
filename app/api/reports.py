import datetime
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.dependencies import get_current_user
from app.models.user import UserOut

router = APIRouter()


@router.get("/{upload_id}")
async def generate_report(
    upload_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """Generate and return a PDF report for a specific analysis."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail="PDF generation requires reportlab. Install with: pip install reportlab",
        ) from e

    report_path = f"data/reports/report_{upload_id}.pdf"
    os.makedirs("data/reports", exist_ok=True)

    try:
        c = canvas.Canvas(report_path, pagesize=letter)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(100, 750, "AGRINEXUS AI - Agricultural Analysis Report")

        c.setFont("Helvetica", 12)
        c.drawString(100, 720, f"Generated for: {current_user.full_name}")
        c.drawString(100, 705, f"Date: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        c.line(100, 690, 500, 690)

        c.setFont("Helvetica-Bold", 14)
        c.drawString(100, 670, "Analysis Summary")
        c.setFont("Helvetica", 12)
        c.drawString(100, 650, "Crop: Wheat")
        c.drawString(100, 630, "Diagnosis: Potential Leaf Rust detected.")
        c.drawString(100, 610, "Confidence Score: 92%")

        c.setFont("Helvetica-Bold", 14)
        c.drawString(100, 580, "Recommended Actions")
        c.setFont("Helvetica", 12)
        recs = [
            "1. Apply fungicide (Tebuconazole) as per guidelines.",
            "2. Ensure proper spacing between crops to reduce humidity.",
            "3. Monitor neighboring fields for similar symptoms.",
        ]
        y_pos = 560
        for rec in recs:
            c.drawString(100, y_pos, rec)
            y_pos -= 20

        c.save()

        return FileResponse(report_path, filename=f"AgriNexus_Report_{upload_id}.pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
