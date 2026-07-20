from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.drone_record import DroneRecord


def compute_stats(db: Session) -> dict:
    total = db.execute(select(func.count()).select_from(DroneRecord)).scalar_one()
    avg_battery = db.execute(select(func.avg(DroneRecord.battery_percent))).scalar_one()

    by_status = dict(
        db.execute(
            select(DroneRecord.status, func.count()).group_by(DroneRecord.status)
        ).all()
    )
    by_type = dict(
        db.execute(
            select(DroneRecord.drone_type, func.count()).group_by(DroneRecord.drone_type)
        ).all()
    )

    return {
        "total_records": total,
        "avg_battery_percent": round(avg_battery, 2) if avg_battery is not None else None,
        "by_status": {status.value: count for status, count in by_status.items()},
        "by_drone_type": by_type,
    }
