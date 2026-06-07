import sqlite3
import os
from datetime import datetime
from app.config import settings

DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "plants.db")

def get_sqlite_conn():
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_sqlite_db():
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    
    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # Create plant_uploads table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS plant_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        image_path TEXT NOT NULL,
        upload_date TEXT NOT NULL
    );
    """)
    
    # Create plant_analysis table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS plant_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id INTEGER NOT NULL,
        plant_name TEXT NOT NULL,
        scientific_name TEXT,
        confidence REAL,
        condition TEXT,
        disease_detected TEXT,
        health_score REAL,
        recommendations TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (upload_id) REFERENCES plant_uploads (id) ON DELETE CASCADE
    );
    """)
    
    conn.commit()
    conn.close()
