import asyncio

class MockCollection:
    def __init__(self, name):
        self.name = name
        self._data = []

    async def find_one(self, query):
        for item in self._data:
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                return item
        return None

    async def insert_one(self, document):
        self._data.append(document)
        class Result:
            inserted_id = "mock_id_" + str(len(self._data))
        return Result()

    async def count_documents(self, query=None):
        if not query:
            return len(self._data)
        count = 0
        for item in self._data:
            match = True
            for k, v in (query or {}).items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                count += 1
        return count

    async def delete_one(self, query):
        deleted_count = 0
        for i, item in enumerate(self._data):
            match = True
            for k, v in query.items():
                if k == "_id":
                    if str(item.get("_id")) != str(v):
                        match = False
                        break
                elif item.get(k) != v:
                    match = False
                    break
            if match:
                self._data.pop(i)
                deleted_count = 1
                break
        
        class DeleteResult:
            def __init__(self, count):
                self.deleted_count = count
        return DeleteResult(deleted_count)

    def find(self, query=None):
        return MockCursor(self._data, query or {})


class MockCursor:
    def __init__(self, data, query=None):
        self._all = data
        self.query = query or {}
        self._index = 0

    def _filtered(self):
        if not self.query:
            return list(self._all)
        out = []
        for item in self._all:
            # Handle query filters
            match = True
            for k, v in self.query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                out.append(item)
        return out

    def sort(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    async def to_list(self, length):
        return self._filtered()[:length]

    def __aiter__(self):
        self._index = 0
        self._results = self._filtered()
        return self

    async def __anext__(self):
        if self._index >= len(self._results):
            raise StopAsyncIteration
        val = self._results[self._index]
        self._index += 1
        return val


class MockDatabase:
    def __init__(self):
        self.users = MockCollection("users")
        self.uploads = MockCollection("uploads")
        self.chat_history = MockCollection("chat_history")
        self.feedback = MockCollection("feedback")
        self.reports = MockCollection("reports")

    def __getitem__(self, name):
        return MockCollection(name)

mock_db = MockDatabase()

# Pre-populate with realistic system overview and user management data
from datetime import datetime, timedelta
import random
from app.utils.security import get_password_hash

users_to_seed = [
    {"email": "admin@agrinexus.com", "full_name": "Admin User", "role": "admin", "created_at": datetime(2026, 5, 26)},
    {"email": "farmer@example.com", "full_name": "Farmer Joe", "role": "farmer", "created_at": datetime(2026, 5, 25)},
    {"email": "hamza@agrinexus.com", "full_name": "dede", "role": "farmer", "created_at": datetime(2026, 5, 25)},
    {"email": "hamzasaleem@agrinexus.com", "full_name": "hamza", "role": "farmer", "created_at": datetime(2026, 5, 26)},
    {"email": "ershan@agrinexus.com", "full_name": "Ershan", "role": "farmer", "created_at": datetime(2026, 5, 26)},
    {"email": "hamzasq@agrinexus.com", "full_name": "hamza", "role": "farmer", "created_at": datetime(2026, 5, 26)},
    {"email": "all@k.com", "full_name": "ALLO", "role": "farmer", "created_at": datetime(2026, 5, 26)},
    {"email": "hamzasaleem1298@gmail.com", "full_name": "Hamza", "role": "farmer", "created_at": datetime(2026, 5, 26)},
]

for idx, u in enumerate(users_to_seed):
    mock_db.users._data.append({
        "_id": f"mock_user_id_{idx}",
        "email": u["email"],
        "hashed_password": get_password_hash("password" if u["role"] == "farmer" else "admin123"),
        "full_name": u["full_name"],
        "role": u["role"],
        "is_active": True,
        "created_at": u["created_at"]
    })

# Seed 12 uploads
now = datetime.utcnow()
for i in range(12):
    mock_db.uploads._data.append({
        "_id": f"upload_{i}",
        "timestamp": now - timedelta(days=random.randint(0, 10))
    })

# Seed chat history over last 30 days
for i in range(30):
    day = now - timedelta(days=i)
    # Add random number of queries for this day (between 10 and 50)
    for _ in range(random.randint(10, 50)):
        ts = datetime(day.year, day.month, day.day, random.randint(0, 23), random.randint(0, 59))
        mock_db.chat_history._data.append({
            "timestamp": ts
        })
