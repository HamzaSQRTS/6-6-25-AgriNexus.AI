import io
import os

try:
    import docx
except ImportError:
    docx = None

try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

from app.services.image_ocr import extract_text_from_image_bytes


class DocumentProcessor:
    async def extract_text_from_image(self, file_content: bytes) -> str:
        """Extract text from JPG/PNG/WebP via OCR (RapidOCR or EasyOCR)."""
        return extract_text_from_image_bytes(file_content)

    async def extract_text_from_pdf(self, file_content: bytes) -> str:
        if PyPDF2 is None:
            raise RuntimeError(
                "PyPDF2 is not installed. Install with: pip install PyPDF2"
            )
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() or ""
        return text

    async def extract_text_from_docx(self, file_content: bytes) -> str:
        if docx is None:
            raise RuntimeError(
                "python-docx is not installed. Install with: pip install python-docx"
            )
        document = docx.Document(io.BytesIO(file_content))
        text = "\n".join([para.text for para in document.paragraphs])
        return text

    async def process(self, file_content: bytes, filename: str) -> str:
        """Process file based on extension and return raw text."""
        ext = os.path.splitext(filename)[1].lower()

        if ext in [".jpg", ".jpeg", ".png", ".webp"]:
            return await self.extract_text_from_image(file_content)
        if ext == ".pdf":
            return await self.extract_text_from_pdf(file_content)
        if ext == ".docx":
            return await self.extract_text_from_docx(file_content)
        if ext in [".txt", ".csv"]:
            return file_content.decode("utf-8")
        raise ValueError(f"Unsupported file format: {ext}")


document_processor = DocumentProcessor()
