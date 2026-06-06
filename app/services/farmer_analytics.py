"""
Aggregate farmer upload records into dashboard payloads.
Matches keys requested by the user: dry_density, silt_clay, etc.
"""
from __future__ import annotations
from typing import Any, Dict, List

def build_farmer_analytics(upload_docs: List[dict]) -> Dict[str, Any]:
    if not upload_docs:
        return {"upload_count": 0, "summary": None, "charts": {}, "reports": [], "recent_uploads": []}

    processed_reports = []
    latest_report = None
    
    for doc in reversed(upload_docs):
        meta = doc.get("metadata") or {}
        extracted = meta.get("extracted_data") or {}
        report_type = meta.get("report_type")
        
        if report_type and report_type != "unknown":
            filename = doc.get("filename") or "unknown"
            ai_summary = meta.get("ai_summary", "")
            
            report_charts = {}
            if report_type == "agriculture_soil":
                agri_data = []
                mapping = {"Nitrogen": "nitrogen", "Phosphorus": "phosphorus", "Potassium": "potassium"}
                for label, key in mapping.items():
                    val = extracted.get(key, {}).get("value")
                    if val is not None: agri_data.append({"name": label, "value": val})
                if agri_data: report_charts["agriculture_soil"] = agri_data
                
            elif report_type == "geotechnical_soil":
                geo_bar = []
                if extracted.get("moisture"): geo_bar.append({"name": "Moisture %", "value": extracted["moisture"]["value"]})
                if extracted.get("dry_density"): geo_bar.append({"name": "Density", "value": extracted["dry_density"]["value"]})
                if extracted.get("cbr"): geo_bar.append({"name": "CBR %", "value": extracted["cbr"]["value"]})
                if geo_bar: report_charts["geotechnical_bar"] = geo_bar

                geo_pie = []
                if extracted.get("gravel"): geo_pie.append({"name": "Gravel", "value": extracted["gravel"]["value"]})
                if extracted.get("sand"): geo_pie.append({"name": "Sand", "value": extracted["sand"]["value"]})
                if extracted.get("silt_clay"): geo_pie.append({"name": "Silt/Clay", "value": extracted["silt_clay"]["value"]})
                if geo_pie: report_charts["geotechnical_composition"] = geo_pie

                geo_limits = []
                if extracted.get("liquid_limit"): geo_limits.append({"name": "Liquid Limit", "value": extracted["liquid_limit"]["value"]})
                if extracted.get("plastic_limit"): geo_limits.append({"name": "Plastic Limit", "value": extracted["plastic_limit"]["value"]})
                if extracted.get("free_swell"): geo_limits.append({"name": "Free Swell", "value": extracted["free_swell"]["value"]})
                if geo_limits: report_charts["geotechnical_limits"] = geo_limits
                
            elif report_type == "weather":
                forecast = extracted.get("forecast", [])
                weather_forecast = []
                weather_chart = []
                for day in forecast:
                    weather_forecast.append({
                        "day": day.get("day"),
                        "High": day.get("temp_high"),
                        "Low": day.get("temp_low"),
                        "condition": day.get("condition")
                    })
                    weather_chart.append({
                        "name": day.get("day"),
                        "High": day.get("temp_high"),
                        "Low": day.get("temp_low")
                    })
                if weather_forecast:
                    report_charts["weather_forecast"] = weather_forecast
                    report_charts["weather_forecast_chart"] = weather_chart
            
            report_info = {
                "filename": filename,
                "report_type": report_type,
                "confidence": meta.get("confidence", 0),
                "timestamp": meta.get("timestamp"),
                "ai_summary": ai_summary,
                "charts": report_charts,
                "raw_json": meta.get("raw_json", {})
            }
            
            processed_reports.append(report_info)
            if not latest_report:
                latest_report = report_info

    summary = {
        "latest_report_type": latest_report["report_type"] if latest_report else "None",
        "latest_confidence": latest_report["confidence"] if latest_report else 0,
        "latest_ai_summary": latest_report["ai_summary"] if latest_report else "No data found."
    }

    # Recent uploads
    recent_uploads = []
    for doc in list(reversed(upload_docs))[:15]:
        meta = doc.get("metadata") or {}
        recent_uploads.append({
            "filename": doc.get("filename") or "unknown",
            "report_type": meta.get("report_type", "unknown"),
            "confidence": meta.get("confidence", 0),
            "timestamp": meta.get("timestamp"),
            "ai_summary": meta.get("ai_summary", "")
        })

    return {
        "upload_count": len(upload_docs),
        "summary": summary,
        "charts": latest_report["charts"] if latest_report else {},
        "reports": processed_reports,
        "recent_uploads": recent_uploads,
    }
