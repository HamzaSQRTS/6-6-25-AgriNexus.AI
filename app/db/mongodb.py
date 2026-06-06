from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
import logging

class Database:
    client: AsyncIOMotorClient = None
    db = None
    is_mock: bool = False

db_instance = Database()

async def connect_to_mongo():
    try:
        # Set a short timeout for server selection so it fails fast if Mongo is not running
        db_instance.client = AsyncIOMotorClient(
            settings.MONGODB_URL, 
            serverSelectionTimeoutMS=2000
        )
        # Try a simple command to check connectivity
        await db_instance.client.admin.command('ping')
        db_instance.db = db_instance.client[settings.DATABASE_NAME]
        db_instance.is_mock = False
        logging.info("Connected to MongoDB")
        
        # Seed default admin user
        try:
            from app.utils.security import get_password_hash
            admin_email = "admin@agrinexus.com"
            admin_exists = await db_instance.db.users.find_one({"email": admin_email})
            if not admin_exists:
                await db_instance.db.users.insert_one({
                    "email": admin_email,
                    "hashed_password": get_password_hash("admin123"),
                    "full_name": "Admin User",
                    "role": "admin",
                    "is_active": True
                })
                logging.info("Seeded default admin user to MongoDB")
        except Exception as seed_err:
            logging.warning(f"Failed to seed default admin user: {seed_err}")
            
    except Exception as e:
        logging.warning(f"MongoDB connection failed: {e}. Falling back to mock database.")
        from app.db.mock_db import mock_db
        db_instance.db = mock_db
        db_instance.is_mock = True

async def close_mongo_connection():
    if db_instance.client and not db_instance.is_mock:
        db_instance.client.close()

def get_db():
    return db_instance.db
