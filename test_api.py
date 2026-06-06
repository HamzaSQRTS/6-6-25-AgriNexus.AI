import requests
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_health():
    response = requests.get("http://127.0.0.1:8000/")
    print(f"Health Check: {response.json()}")

def test_register():
    payload = {
        "email": "farmer@example.com",
        "password": "password123",
        "full_name": "Farmer Joe",
        "role": "farmer"
    }
    response = requests.post(f"{BASE_URL}/auth/register", json=payload)
    print(f"Register: {response.status_code} - {response.json()}")

def test_login():
    payload = {
        "username": "farmer@example.com",
        "password": "password123"
    }
    response = requests.post(f"{BASE_URL}/auth/login", data=payload)
    print(f"Login: {response.status_code} - {response.json()}")
    return response.json().get("access_token")

if __name__ == "__main__":
    try:
        test_health()
        test_register()
        token = test_login()
        print("Tests completed. Ensure backend is running.")
    except Exception as e:
        print(f"Error running tests: {e}")
