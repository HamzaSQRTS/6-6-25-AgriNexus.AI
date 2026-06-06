import json
import os
from typing import Dict, Any, List

# Load knowledge base
KB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "knowledge_base.json")

def load_kb():
    if os.path.exists(KB_PATH):
        try:
            with open(KB_PATH, "r") as f:
                return json.load(f)
        except:
            return []
    return []

def search_kb(query: str) -> List[Dict[str, Any]]:
    kb = load_kb()
    import re
    query_lower = query.lower().strip()
    if not query_lower:
        return []
    
    results = []
    for item in kb:
        # Check if the query exists as a whole word or significant phrase
        pattern = r'\b' + re.escape(query_lower) + r'\b'
        if re.search(pattern, item["text"].lower()) or re.search(pattern, item["topic"].lower()):
            results.append(item)
    return results

def get_smart_mock_response(query: str) -> Dict[str, Any]:
    query_lower = query.lower().strip()
    
    # Handle greetings
    greetings = ["hi", "hello", "hey", "greetings", "good morning", "good afternoon"]
    if any(g in query_lower for g in greetings) and len(query_lower) < 10:
        return {
            "diagnosis": "Hello! I am your AgriNexus AI assistant. How can I help you with your crops or soil management today?",
            "confidence": 1.0,
            "recommendations": ["Ask about soil management", "Ask about crop diseases", "Upload a document for analysis"],
            "citations": ["System Greeting"]
        }

    kb_results = search_kb(query)
    
    if kb_results:
        best_match = kb_results[0]
        diagnosis = f"Based on our knowledge base regarding {best_match['topic']}: {best_match['text'][:200]}..."
        recommendations = [best_match['topic']]
        # Extract some recommendations from text if possible
        if "tillage" in best_match['text'].lower():
            recommendations = ["Minimize tillage", "Use no-till systems", "Maintain soil cover"]
        elif "nutrient" in best_match['text'].lower():
            recommendations = ["Perform soil analysis", "Apply balanced N-P-K", "Combine organic/inorganic fertilizers"]
        elif "fungicide" in best_match['text'].lower():
            recommendations = ["Apply fungicides at anthesis", "Plant resistant varieties", "Crop rotation"]
            
        return {
            "diagnosis": diagnosis,
            "confidence": 0.9,
            "recommendations": recommendations,
            "citations": [best_match['id']]
        }
    
    # Generic fallback if no KB match
    return {
        "diagnosis": "I couldn't find a specific match in our local knowledge base for that query. If you have an AI API key configured, please ensure it has active credits.",
        "confidence": 0.4,
        "recommendations": ["Try searching for specific crops like 'wheat' or 'corn'", "Check your API credit balance", "Monitor field daily"],
        "citations": ["General Agronomy"]
    }
