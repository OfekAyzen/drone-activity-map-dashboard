import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings:
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'drone.db'}")
    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:4200").split(",")
        if origin.strip()
    ]
    pipeline_input_dir: Path = BASE_DIR / os.getenv("PIPELINE_INPUT_DIR", "data/incoming")


settings = Settings()
