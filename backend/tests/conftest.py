import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.session import Base
from app.main import app


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def valid_row() -> dict:
    return {
        "drone_id": "DRONE-001",
        "drone_type": "Quadcopter",
        "operator_id": "OP-123",
        "latitude": 32.0853,
        "longitude": 34.7818,
        "altitude_m": 120,
        "speed_kmh": 45,
        "battery_percent": 76,
        "timestamp": "2026-06-28T10:30:00Z",
        "status": "active",
    }


@pytest.fixture()
def invalid_row() -> dict:
    return {
        "drone_id": "",
        "drone_type": "Quadcopter",
        "operator_id": "OP-123",
        "latitude": 200,
        "longitude": 34.7818,
        "altitude_m": -50,
        "speed_kmh": 45,
        "battery_percent": 150,
        "timestamp": "invalid-date",
        "status": "flying",
    }


@pytest.fixture()
def sample_rows(valid_row, invalid_row) -> list[dict]:
    return [valid_row, invalid_row]
