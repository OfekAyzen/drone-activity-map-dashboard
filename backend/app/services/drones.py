from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.drone_record import DroneRecord
from app.models.enums import DroneStatus


def query_drones(
    db: Session,
    *,
    drone_id: str | None = None,
    drone_type: str | None = None,
    status: DroneStatus | None = None,
    operator_id: str | None = None,
    min_battery: float | None = None,
    from_: datetime | None = None,
    to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[DroneRecord], int]:
    stmt = select(DroneRecord)

    if drone_id is not None:
        stmt = stmt.where(DroneRecord.drone_id == drone_id)
    if drone_type is not None:
        stmt = stmt.where(DroneRecord.drone_type == drone_type)
    if status is not None:
        stmt = stmt.where(DroneRecord.status == status)
    if operator_id is not None:
        stmt = stmt.where(DroneRecord.operator_id == operator_id)
    if min_battery is not None:
        stmt = stmt.where(DroneRecord.battery_percent >= min_battery)
    if from_ is not None:
        stmt = stmt.where(DroneRecord.timestamp >= from_)
    if to is not None:
        stmt = stmt.where(DroneRecord.timestamp < to)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()

    rows = (
        db.execute(stmt.order_by(DroneRecord.timestamp.desc()).limit(limit).offset(offset))
        .scalars()
        .all()
    )
    return list(rows), total


def get_drone(db: Session, drone_record_id: int) -> DroneRecord | None:
    return db.get(DroneRecord, drone_record_id)
