"""
Image OCR: EasyOCR (CNN stack) when available, else RapidOCR (ONNX, no torch).
"""
import io
from typing import List, Optional

try:
    import easyocr
except ImportError:
    easyocr = None

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    RapidOCR = None

try:
    from PIL import Image
    import numpy as np
except ImportError:
    Image = None
    np = None

_easyocr_reader = None
_rapidocr_engine = None


def _lines_from_rapidocr_result(result) -> List[str]:
    if not result:
        return []
    lines: List[str] = []
    for item in result:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            text = item[1]
            if text:
                lines.append(str(text))
    return lines


def extract_text_from_image_bytes(file_content: bytes) -> str:
    if Image is None or np is None:
        raise RuntimeError(
            "Pillow and numpy are required for image OCR. "
            "Install with: pip install pillow numpy"
        )

    img = Image.open(io.BytesIO(file_content)).convert("RGB")
    arr = np.array(img)

    global _easyocr_reader, _rapidocr_engine

    if RapidOCR is not None:
        try:
            if _rapidocr_engine is None:
                _rapidocr_engine = RapidOCR()
            out, _ = _rapidocr_engine(arr)
            text = " ".join(_lines_from_rapidocr_result(out)).strip()
            if text:
                return text
        except Exception:
            pass

    if easyocr is not None:
        try:
            if _easyocr_reader is None:
                _easyocr_reader = easyocr.Reader(["en"], gpu=False)
            parts = _easyocr_reader.readtext(arr, detail=0)
            text = " ".join(str(p) for p in parts if p).strip()
            if text:
                return text
        except Exception:
            pass

    if RapidOCR is not None or easyocr is not None:
        return ""

    raise RuntimeError(
        "Image OCR is not available. Install one of:\n"
        "  pip install rapidocr-onnxruntime opencv-python-headless\n"
        "  pip install easyocr   (requires PyTorch; may fail on some Windows setups)"
    )
