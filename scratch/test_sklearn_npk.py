import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score

csv_path = r"c:\Users\hamza\Desktop\agrinexus_8am_copy\Soil Chrachteristics\Soil Chrachteristics.csv"
df = pd.read_csv(csv_path)

# Clean soil type
le_soil = LabelEncoder()
df['soil_type_encoded'] = le_soil.fit_transform(df['Soil Type'].astype(str))

# Features: include N, P, K
features = ['Temparature', 'Humidity', 'Moisture', 'Nitrogen', 'Potassium', 'Phosphorous', 'soil_type_encoded']
X = df[features]
y = df['Crop Type']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

rf = RandomForestClassifier(n_estimators=100, random_state=42)
rf.fit(X_train, y_train)

preds = rf.predict(X_test)
acc = accuracy_score(y_test, preds)
print(f"Scikit-Learn Accuracy with NPK features included: {acc * 100:.2f}%")
