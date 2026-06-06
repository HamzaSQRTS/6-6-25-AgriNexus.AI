import re
from typing import Dict, Any

class ClassificationService:
    """
    Classifies agricultural reports based on keywords and patterns.
    """
    
    PATTERNS = {
        "agriculture_soil": [
            r"nitrogen", r"phosphorus", r"potassium", r"npk", r"soil pH", r"fertility", r"soil test", r"organic matter"
        ],
        "geotechnical_soil": [
            r"cbr", r"plastic limit", r"liquid limit", r"gravel", r"moisture content", r"density", r"compaction", r"sieve analysis"
        ],
        "weather": [
            r"rainfall", r"humidity", r"precipitation", r"temperature", r"wind speed", r"forecast", r"weather station",
            r"today", r"mon", r"tue", r"wed", r"thu", r"fri", r"sat", r"sun", r"sunny", r"clouds", r"cloudy", r"weather"
        ],
        "crop_disease": [
            r"blight", r"rust", r"mildew", r"infestation", r"fungus", r"pest", r"symptoms", r"diagnosis", r"pathogen"
        ],
        "fertilizer": [
            r"invoice", r"fertilizer", r"urea", r"dap", r"potash", r"ammonium", r"purchase", r"quantity", r"price"
        ],
        "yield_production": [
            r"harvest", r"yield", r"tonnage", r"production report", r"bushels", r"acreage", r"efficiency"
        ],
        "water_management": [
            r"irrigation", r"water usage", r"drip", r"sprinkler", r"flow rate", r"acre-inches", r"watering", r"water source", r"moisture sensor", r"water management"
        ],
        "pest_management": [
            r"pest control", r"insecticide", r"pesticide", r"insect", r"aphids", r"traps", r"trapping", r"scouting", r"spray log", r"pest population"
        ],
        "market_price_economics": [
            r"market price", r"commodity", r"revenue", r"profit", r"operating cost", r"expenses", r"net income", r"financial", r"sale price", r"wholesale", r"retail"
        ],
        "machinery_equipment": [
            r"tractor", r"harvester", r"maintenance log", r"fuel usage", r"machinery", r"telemetry", r"equipment", r"combine", r"planter", r"operational hours", r"gps tracking"
        ]
    }

    def classify(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()
        scores = {}
        
        for report_type, keywords in self.PATTERNS.items():
            score = 0
            for pattern in keywords:
                if re.search(r"\b" + pattern + r"\b", text_lower):
                    score += 1
            scores[report_type] = score
        
        # Determine the best match
        best_match = max(scores, key=scores.get)
        confidence = (scores[best_match] / len(self.PATTERNS[best_match])) if scores[best_match] > 0 else 0
        
        if scores[best_match] == 0:
            return {
                "report_type": "unknown",
                "confidence": 0,
                "scores": scores
            }
        
        return {
            "report_type": best_match,
            "confidence": round(confidence, 2),
            "scores": scores
        }

classification_service = ClassificationService()
