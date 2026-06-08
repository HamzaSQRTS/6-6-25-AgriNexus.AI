import json
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score

# Load crop training data JSON
with open('data/crop_training_data.json', 'r') as f:
    data = json.load(f)

df = pd.DataFrame(data)

# Encode soil_type
le_soil = LabelEncoder()
df['soil_type_encoded'] = le_soil.fit_transform(df['soil_type'])

X = df[['temperature', 'humidity', 'soil_moisture', 'soil_type_encoded']]
y = df['crop']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

rf = RandomForestClassifier(n_estimators=100, random_state=42)
rf.fit(X_train, y_train)

preds = rf.predict(X_test)
acc = accuracy_score(y_test, preds)
print(f"Scikit-Learn Random Forest Accuracy on these 4 features: {acc * 100:.2f}%")
