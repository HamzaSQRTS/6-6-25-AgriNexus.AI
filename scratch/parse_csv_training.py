import csv
import json
import random
import os

csv_path = r"c:\Users\hamza\Desktop\agrinexus_8am_copy\Soil Chrachteristics\Soil Chrachteristics.csv"
json_output_path = r"c:\Users\hamza\Desktop\agrinexus_8am_copy\data\crop_training_data.json"

dataset = []

# Soil type normalizer mapping
soil_type_map = {
    "sandy": "sandy",
    "loamy": "loamy",
    "black": "loamy",
    "red": "loamy",
    "clayey": "clay",
    "clay": "clay",
    "silty": "silty"
}

with open(csv_path, mode='r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Read raw columns from CSV
        # Headers: Temparature,Humidity,Moisture,Soil Type,Crop Type,Nitrogen,Potassium,Phosphorous,Fertilizer Name
        try:
            temp = float(row.get("Temparature") or row.get("Temperature") or 25)
            humidity = float(row.get("Humidity") or 60)
            moisture = float(row.get("Moisture") or 40)
            raw_soil = (row.get("Soil Type") or "loamy").strip().lower()
            soil_type = soil_type_map.get(raw_soil, "loamy")
            crop = (row.get("Crop Type") or "Wheat").strip()
            
            # Synthesize or derive missing agronomic metrics to keep feature tree functional
            # pH ranges: Sandy soils lean slightly acidic; clayey/black soils lean alkaline
            if soil_type == "sandy":
                ph = round(random.uniform(5.5, 6.5), 2)
                om = round(random.uniform(0.5, 1.8), 2)
                drainage = round(random.uniform(70, 95), 1)
            elif soil_type == "clay":
                ph = round(random.uniform(7.0, 8.2), 2)
                om = round(random.uniform(2.5, 5.2), 2)
                drainage = round(random.uniform(15, 35), 1)
            elif soil_type == "silty":
                ph = round(random.uniform(6.0, 7.2), 2)
                om = round(random.uniform(2.0, 4.0), 2)
                drainage = round(random.uniform(45, 65), 1)
            else: # loamy
                ph = round(random.uniform(6.2, 7.4), 2)
                om = round(random.uniform(1.8, 3.5), 2)
                drainage = round(random.uniform(50, 75), 1)
                
            # Rainfall: Paddy requires extremely heavy water; Maize/Sugarcane/Cotton moderate; Barley/Wheat low
            crop_lower = crop.lower()
            if "paddy" in crop_lower or "rice" in crop_lower:
                rainfall = round(random.uniform(180, 300), 1)
            elif "sugarcane" in crop_lower or "cotton" in crop_lower:
                rainfall = round(random.uniform(100, 200), 1)
            elif "maize" in crop_lower:
                rainfall = round(random.uniform(80, 160), 1)
            elif "wheat" in crop_lower or "barley" in crop_lower:
                rainfall = round(random.uniform(30, 80), 1)
            else:
                rainfall = round(random.uniform(50, 140), 1)
                
            dataset.append({
                "temperature": temp,
                "humidity": humidity,
                "rainfall": rainfall,
                "soil_ph": ph,
                "soil_moisture": moisture,
                "organic_matter": om,
                "drainage": drainage,
                "soil_type": soil_type,
                "region": "subtropical",
                "crop": crop
            })
        except Exception as e:
            continue

print(f"Parsed {len(dataset)} training records successfully.")

with open(json_output_path, mode='w', encoding='utf-8') as out_f:
    json.dump(dataset, out_f, indent=2)

print("Overwrote data/crop_training_data.json successfully.")
