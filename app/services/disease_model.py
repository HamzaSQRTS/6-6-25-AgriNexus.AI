import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as transforms
from PIL import Image
import io

class AgriCNN(nn.Module):
    def __init__(self, num_classes=38): # Example: 38 classes from PlantVillage
        super(AgriCNN, self).__init__()
        self.conv1 = nn.Conv2d(3, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(64 * 56 * 56, 512)
        self.fc2 = nn.Linear(512, num_classes)
        self.dropout = nn.Dropout(0.5)

    def forward(self, x):
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))
        x = x.view(-1, 64 * 56 * 56)
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        return x

class DiseaseDiagnosisService:
    def __init__(self, model_path: str = "backend/models/disease_model.pth"):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = AgriCNN().to(self.device)
        self.model_path = model_path
        
        # Load pre-trained weights if exist
        try:
            if os.path.exists(self.model_path):
                self.model.load_state_dict(torch.load(self.model_path, map_location=self.device))
            self.model.eval()
        except:
            print("No model weights found. Using untrained model for demo.")

        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

        # Example classes
        self.classes = [
            "Apple___Apple_scab", "Apple___Black_rot", "Corn___Common_rust",
            "Grape___Black_rot", "Peach___Bacterial_spot", "Potato___Early_blight",
            "Tomato___Bacterial_spot", "Healthy"
        ]

    async def predict(self, image_bytes: bytes):
        """Predict disease from image."""
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = self.transform(image).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            outputs = self.model(tensor)
            probabilities = F.softmax(outputs, dim=1)
            confidence, predicted = torch.max(probabilities, 1)
        
        class_idx = predicted.item()
        # Ensure index is within range of self.classes
        if class_idx < len(self.classes):
            label = self.classes[class_idx]
        else:
            label = "Unknown Disease"
            
        return {
            "disease": label,
            "confidence": float(confidence.item())
        }

disease_service = DiseaseDiagnosisService()
import os
