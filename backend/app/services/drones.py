from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, aliased

from app.models.drone_record import DroneRecord
from app.models.enums import DroneStatus


def _apply_drone_filters(
    stmt: Select,
    *,
    drone_id: str | None,
    drone_type: str | None,
    status: DroneStatus | None,
    operator_id: str | None,
    min_battery: float | None,
    from_: datetime | None,
    to: datetime | None,
) -> Select:
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
    return stmt


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
    stmt = _apply_drone_filters(
        select(DroneRecord),
        drone_id=drone_id,
        drone_type=drone_type,
        status=status,
        operator_id=operator_id,
        min_battery=min_battery,
        from_=from_,
        to=to,
    )

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()

    rows = (
        db.execute(stmt.order_by(DroneRecord.timestamp.desc()).limit(limit).offset(offset))
        .scalars()
        .all()
    )
    return list(rows), total


def query_latest_drones(
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
    """Return each matching drone's most recent record.

    Filters (including from_/to) narrow the eligible rows before ranking, so this
    returns each drone's latest record *within the filtered set* - a drone with no
    rows left in that set after filtering simply doesn't appear.
    """
    filtered = _apply_drone_filters(
        select(DroneRecord),
        drone_id=drone_id,
        drone_type=drone_type,
        status=status,
        operator_id=operator_id,
        min_battery=min_battery,
        from_=from_,
        to=to,
    )

    ranked = filtered.add_columns(
        func.row_number()
        .over(partition_by=DroneRecord.drone_id, order_by=DroneRecord.timestamp.desc())
        .label("rn")
    ).subquery()

    latest = aliased(DroneRecord, ranked)
    latest_stmt = select(latest).where(ranked.c.rn == 1)

    total = db.execute(select(func.count()).select_from(latest_stmt.subquery())).scalar_one()

    rows = (
        db.execute(latest_stmt.order_by(ranked.c.timestamp.desc()).limit(limit).offset(offset))
        .scalars()
        .all()
    )
    return list(rows), total


def get_drone(db: Session, drone_record_id: int) -> DroneRecord | None:
    return db.get(DroneRecord, drone_record_id)
