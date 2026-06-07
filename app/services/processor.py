import easyocr
import docx
import PyPDF2
import io
import os
from typing import Dict, Any, List
from PIL import Image

class DocumentProcessor:
    def __init__(self):
        # Initialize EasyOCR reader
        self.reader = easyocr.Reader(['en'])

    async def process_image(self, file_content: bytes) -> str:
        """Extract text from images using EasyOCR."""
        result = self.reader.readtext(file_content, detail=0)
        return " ".join(result)

    async def process_pdf(self, file_content: bytes) -> str:
        """Extract text from PDF."""
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text()
        return text

    async def process_docx(self, file_content: bytes) -> str:
        """Extract text from DOCX."""
        doc = docx.Document(io.BytesIO(file_content))
        text = "\n".join([para.text for para in doc.paragraphs])
        return text

    async def process_txt(self, file_content: bytes) -> str:
        """Extract text from TXT."""
        return file_content.decode("utf-8")

    async def extract_content(self, file_content: bytes, filename: str) -> str:
        """Route to appropriate parser based on file extension."""
        ext = os.path.splitext(filename)[1].lower()
        if ext in ['.jpg', '.jpeg', '.png']:
            return await self.process_image(file_content)
        elif ext == '.pdf':
            return await self.process_pdf(file_content)
        elif ext == '.docx':
            return await self.process_docx(file_content)
        elif ext == '.txt':
            return await self.process_txt(file_content)
        else:
            raise ValueError(f"Unsupported file format: {ext}")

    def extract_metadata(self, text: str) -> Dict[str, Any]:
        """Simple metadata extraction logic (placeholder for more advanced extraction)."""
        # In a production app, use NER or LLM to extract crop names, diseases, etc.
        metadata = {
            "crop": None,
            "disease": None,
            "location": None,
            "keywords": []
        }
        # Basic keyword detection (example)
        keywords = ["wheat", "rice", "corn", "blight", "rust", "pest"]
        for kw in keywords:
            if kw in text.lower():
                metadata["keywords"].append(kw)
        
        return metadata

processor = DocumentProcessor()
