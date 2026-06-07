"""
Image OCR branch — CNN path (EasyOCR) or ONNX RapidOCR fallback.
"""
import os

from app.services.image_ocr import extract_text_from_image_bytes


class ImageOCRCNNPipeline:
    """Routes raster images through the OCR stack."""

    IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})

    def supports(self, filename: str) -> bool:
        ext = os.path.splitext(filename)[1].lower()
        return ext in self.IMAGE_EXTENSIONS

    async def extract_text(self, file_content: bytes, filename: str) -> str:
        if not self.supports(filename):
            raise ValueError("Not an image type supported by the OCR pipeline")
        return extract_text_from_image_bytes(file_content)


image_ocr_cnn_pipeline = ImageOCRCNNPipeline()
