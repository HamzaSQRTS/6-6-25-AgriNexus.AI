"""
Advanced Text Parser: Uses pdfplumber, PyMuPDF, and fallback OCR.
"""
import csv
import io
import os
from typing import Optional

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import docx
except ImportError:
    docx = None

try:
    import PyPDF2
except ImportError:
    PyPDF2 = None


class TextParserService:
    async def parse_pdf(self, file_content: bytes) -> str:
        extracted_text = ""
        
        # 1. Try pdfplumber (Excellent for tables and layout)
        if pdfplumber is not None:
            try:
                with pdfplumber.open(io.BytesIO(file_content)) as pdf:
                    parts = []
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            parts.append(page_text)
                    extracted_text = "\n".join(parts).strip()
            except Exception:
                pass

        # 2. Try PyMuPDF (Fast and robust) as fallback
        if not extracted_text and fitz is not None:
            try:
                doc = fitz.open(stream=file_content, filetype="pdf")
                parts = [page.get_text() for page in doc]
                extracted_text = "\n".join(parts).strip()
                doc.close()
            except Exception:
                pass

        # 3. Try PyPDF2 as ultimate legacy fallback
        if not extracted_text and PyPDF2 is not None:
            try:
                reader = PyPDF2.PdfReader(io.BytesIO(file_content))
                parts = [page.extract_text() or "" for page in reader.pages]
                extracted_text = "\n".join(parts).strip()
            except Exception:
                pass
        
        # 4. Fallback to OCR if no text found (likely a scanned PDF)
        if not extracted_text:
            try:
                from app.services.image_ocr import extract_text_from_image_bytes
                extracted_text = extract_text_from_image_bytes(file_content)
            except Exception:
                pass
                
        return extracted_text

    async def parse_docx(self, file_content: bytes) -> str:
        if docx is None:
            raise RuntimeError("python-docx is not installed. pip install python-docx")
        document = docx.Document(io.BytesIO(file_content))
        return "\n".join(p.text for p in document.paragraphs if p.text).strip()

    async def parse_txt(self, file_content: bytes) -> str:
        return file_content.decode("utf-8-sig", errors="replace").strip()

    async def parse_csv(self, file_content: bytes) -> str:
        text = file_content.decode("utf-8-sig", errors="replace")
        buf = io.StringIO(text)
        reader = csv.reader(buf)
        lines = ["\t".join(cell.strip() for cell in row) for row in reader]
        return "\n".join(lines).strip()

    async def parse(self, file_content: bytes, filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()
        if ext == ".pdf":
            return await self.parse_pdf(file_content)
        if ext == ".docx":
            return await self.parse_docx(file_content)
        if ext == ".txt":
            return await self.parse_txt(file_content)
        if ext == ".csv":
            return await self.parse_csv(file_content)
        raise ValueError(f"Text parser does not handle extension: {ext}")


text_parser_service = TextParserService()
