from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import DroneStatus


class RawDroneRecord(BaseModel):
    """Lenient schema used by the ingestion pipeline to validate raw input rows.

    Field constraints mirror the exercise spec's validation rules (section 3.3) exactly.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    drone_id: str
    drone_type: str
    operator_id: str
    latitude: float
    longitude: float
    altitude_m: float
    speed_kmh: float
    battery_percent: float
    timestamp: datetime
    status: DroneStatus

    @field_validator("drone_id", "drone_type", "operator_id")
    @classmethod
    def not_empty(cls, value: str) -> str:
        if not value:
            raise ValueError("must not be empty")
        return value

    @field_validator("latitude")
    @classmethod
    def latitude_range(cls, value: float) -> float:
        if not -90 <= value <= 90:
            raise ValueError("latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def longitude_range(cls, value: float) -> float:
        if not -180 <= value <= 180:
            raise ValueError("longitude must be between -180 and 180")
        return value

    @field_validator("altitude_m")
    @classmethod
    def altitude_non_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("altitude_m must be zero or positive")
        return value

    @field_validator("speed_kmh")
    @classmethod
    def speed_non_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("speed_kmh must be zero or positive")
        return value

    @field_validator("battery_percent")
    @classmethod
    def battery_range(cls, value: float) -> float:
        if not 0 <= value <= 100:
            raise ValueError("battery_percent must be between 0 and 100")
        return value


class DroneRecordCreate(RawDroneRecord):
    source: str


class DroneRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    drone_id: str
    drone_type: str
    operator_id: str
    latitude: float
    longitude: float
    altitude_m: float
    speed_kmh: float
    battery_percent: float
    timestamp: datetime
    status: DroneStatus
    source: str
    ingested_at: datetime

