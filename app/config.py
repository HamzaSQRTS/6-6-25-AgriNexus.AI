from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "AGRINEXUS AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    SECRET_KEY: str = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "agrinexus_db"

    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-4o-mini"
    OPENROUTER_FALLBACK_MODELS: str = (
        "openai/gpt-4o-mini,google/gemini-2.0-flash-exp:free,meta-llama/llama-3.1-8b-instruct:free"
    )
    # Web search integration
    SEARCH_API_PROVIDER: str = "tavily"
    SEARCH_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_HTTP_REFERER: str = "http://localhost:3000"
    OPENROUTER_READ_TIMEOUT: float = 90.0
    DAILY_TOKEN_LIMIT: int = 100_000
    MAX_TOKENS_PER_CHAT: int = 1024

    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GROK_API_KEY: str = ""
    GROK_MODEL: str = "grok-2-latest"
    GROK_BASE_URL: str = "https://api.x.ai/v1"

    # Plant species identification & Vision health analysis API keys
    PLANT_ID_API_KEY: str = ""

    # OpenWeatherMap (live weather for Smart Agronomy view)
    OPENWEATHER_API_KEY: str = ""
    OPENWEATHER_BASE_URL: str = "https://api.openweathermap.org/data/2.5"

    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    FAISS_INDEX_PATH: str = "data/faiss_index.bin"

    REDIS_URL: str = "redis://localhost:6379/0"

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001", "http://localhost:3004", "http://127.0.0.1:3004"]


settings = Settings()
