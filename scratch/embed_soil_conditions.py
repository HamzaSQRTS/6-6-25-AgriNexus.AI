import csv
import json
import os

csv_path = "ALL DATA/pakistan_all_cities_soil_conditions.csv"
regions_path = "data/regions.json"

if not os.path.exists(csv_path):
    print("CSV file not found!")
    exit(1)

# Load existing regions
with open(regions_path, "r") as f:
    regions = json.load(f)

# Parse CSV
soil_data = {}
with open(csv_path, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        city = row["City"].strip()
        ph_str = row["pH"].strip()
        moisture_str = row["Moisture Content"].strip()
        om_str = row["Organic Matter"].strip()
        drainage_str = row["Drainage Profile"].strip()

        # Parse pH range to average float
        try:
            if "-" in ph_str:
                parts = ph_str.split("-")
                ph = round((float(parts[0].strip()) + float(parts[1].strip())) / 2, 2)
            else:
                ph = float(ph_str)
        except Exception:
            ph = 7.0

        # Parse Organic Matter range to average float
        try:
            clean_om = om_str.replace("%", "")
            if "-" in clean_om:
                parts = clean_om.split("-")
                om = round((float(parts[0].strip()) + float(parts[1].strip())) / 2, 2)
            else:
                om = float(clean_om)
        except Exception:
            om = 2.0

        # Parse Moisture Content string to integer percentage
        m_lower = moisture_str.lower()
        if "very low" in m_lower:
            moisture = 15
        elif "low" in m_lower:
            moisture = 25
        elif "moderate to high" in m_lower:
            moisture = 55
        elif "moderate" in m_lower:
            moisture = 45
        elif "high" in m_lower:
            moisture = 75
        elif "saturation" in m_lower or "flooded" in m_lower:
            moisture = 85
        else:
            moisture = 40

        # Parse Drainage Profile string to integer percentage
        d_lower = drainage_str.lower()
        if "excessively" in d_lower:
            drainage = 80
        elif "well-drained" in d_lower or "well drained" in d_lower:
            drainage = 65
        elif "moderately" in d_lower:
            drainage = 45
        elif "poorly" in d_lower or "imperfectly" in d_lower:
            drainage = 25
        else:
            drainage = 50

        soil_data[city.lower()] = {
            "ph": ph,
            "moisture": moisture,
            "organicMatter": om,
            "drainage": drainage,
            "raw_moisture": moisture_str,
            "raw_om": om_str,
            "raw_drainage": drainage_str
        }

# Embed soil conditions in regions
embedded_count = 0
for r in regions:
    name_key = r["name"].lower()
    if name_key in soil_data:
        r["soil_conditions"] = soil_data[name_key]
        embedded_count += 1
    else:
        # Defaults if not found
        r["soil_conditions"] = {
            "ph": 6.8,
            "moisture": 40,
            "organicMatter": 2.5,
            "drainage": 50,
            "raw_moisture": "Moderate",
            "raw_om": "2.5%",
            "raw_drainage": "Well-drained"
        }

with open(regions_path, "w") as f:
    json.dump(regions, f, indent=2)

print(f"Successfully embedded soil conditions for {embedded_count} / {len(regions)} regions.")
