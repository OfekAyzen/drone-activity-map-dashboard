from datetime import datetime, timezone

from app.models.drone_record import DroneRecord
from app.models.enums import DroneStatus
from app.services.drones import query_drones, query_latest_drones


def _ts(minute: int) -> datetime:
    return datetime(2026, 6, 28, 10, minute, 0, tzinfo=timezone.utc)


def _record(drone_id: str, minute: int, *, battery: float = 76, status: DroneStatus = DroneStatus.ACTIVE) -> DroneRecord:
    return DroneRecord(
        drone_id=drone_id,
        drone_type="Quadcopter",
        operator_id="OP-123",
        latitude=32.0853,
        longitude=34.7818,
        altitude_m=120,
        speed_kmh=45,
        battery_percent=battery,
        timestamp=_ts(minute),
        status=status,
        source="seed",
    )


def _as_utc(dt: datetime) -> datetime:
    """SQLite drops tzinfo on round-trip; normalize before comparing to a tz-aware constant."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _seed_flood(db) -> None:
    # DRONE-001's records are all later than DRONE-002/003's so it dominates a
    # timestamp-desc page, mirroring the real "one drone floods telemetry" bug.
    for minute in range(10, 15):
        db.add(_record("DRONE-001", minute))
    db.add(_record("DRONE-002", 1))
    db.add(_record("DRONE-003", 2))
    db.commit()


def test_query_drones_can_be_dominated_by_one_drone(db):
    """Documents the raw endpoint's known (unchanged) behavior: it's a global page,
    not per-drone, so a flooding drone can occupy the whole result."""
    _seed_flood(db)

    rows, total = query_drones(db, limit=3)

    assert total == 7
    assert {row.drone_id for row in rows} == {"DRONE-001"}


def test_query_latest_drones_returns_every_distinct_drone(db):
    _seed_flood(db)

    rows, total = query_latest_drones(db, limit=3)

    assert total == 3
    assert {row.drone_id for row in rows} == {"DRONE-001", "DRONE-002", "DRONE-003"}

    flooding = next(row for row in rows if row.drone_id == "DRONE-001")
    assert _as_utc(flooding.timestamp) == _ts(14)


def test_query_latest_drones_paginates_over_distinct_drones(db):
    _seed_flood(db)

    rows, total = query_latest_drones(db, limit=1, offset=1)

    assert total == 3
    assert len(rows) == 1
    # Distinct-drone order by latest timestamp desc: DRONE-001 (14), DRONE-003 (2), DRONE-002 (1).
    assert rows[0].drone_id == "DRONE-003"


def test_query_latest_drones_filters_before_ranking(db):
    db.add(_record("DRONE-001", 0, battery=90))
    db.add(_record("DRONE-001", 1, battery=10))
    db.commit()

    rows, total = query_latest_drones(db, min_battery=50)

    assert total == 1
    assert _as_utc(rows[0].timestamp) == _ts(0)


def test_query_latest_drones_excludes_drones_with_no_rows_in_time_window(db):
    _seed_flood(db)

    rows, total = query_latest_drones(db, from_=_ts(3))

    assert total == 1
    assert rows[0].drone_id == "DRONE-001"
