from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, Float, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base
from app.models.enums import DroneStatus


class DroneRecord(Base):
    __tablename__ = "drone_record"
    __table_args__ = (
        UniqueConstraint("drone_id", "timestamp", "source", name="uq_drone_record_identity"),
        Index("ix_drone_record_lat_lng", "latitude", "longitude"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    drone_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    drone_type: Mapped[str] = mapped_column(String(64), nullable=False)
    operator_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    altitude_m: Mapped[float] = mapped_column(Float, nullable=False)
    speed_kmh: Mapped[float] = mapped_column(Float, nullable=False)
    battery_percent: Mapped[float] = mapped_column(Float, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    status: Mapped[DroneStatus] = mapped_column(SAEnum(DroneStatus, name="drone_status"), nullable=False)
    source: Mapped[str] = mapped_column(String(255), nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
