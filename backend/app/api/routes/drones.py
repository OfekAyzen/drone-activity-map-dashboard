from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.enums import DroneStatus
from app.schemas.common import Page
from app.schemas.drone import DroneRecordRead
from app.services.drones import get_drone, query_drones

router = APIRouter(prefix="/api/drones", tags=["drones"])


@router.get("", response_model=Page[DroneRecordRead])
def list_drones(
    drone_id: str | None = Query(default=None),
    drone_type: str | None = Query(default=None),
    status: DroneStatus | None = Query(default=None),
    operator_id: str | None = Query(default=None),
    min_battery: float | None = Query(default=None, ge=0, le=100),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Page[DroneRecordRead]:
    rows, total = query_drones(
        db,
        drone_id=drone_id,
        drone_type=drone_type,
        status=status,
        operator_id=operator_id,
        min_battery=min_battery,
        from_=from_,
        to=to,
        limit=limit,
        offset=offset,
    )
    return Page(
        items=[DroneRecordRead.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{drone_record_id}", response_model=DroneRecordRead)
def get_drone_record(drone_record_id: int, db: Session = Depends(get_db)) -> DroneRecordRead:
    row = get_drone(db, drone_record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Drone record not found")
    return DroneRecordRead.model_validate(row)
