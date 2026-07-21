import logging
from datetime import UTC, datetime

from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.drone_record import DroneRecord
from app.models.enums import PipelineRunStatus
from app.models.pipeline_run import PipelineRun
from app.pipeline.loaders import load_records
from app.pipeline.validate import validate_records
from app.schemas.drone import RawDroneRecord

log = logging.getLogger(__name__)

DEFAULT_SAMPLE_SOURCE = "sample_drones.json"


def _to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        value = value.astimezone(UTC)
    return value.replace(tzinfo=None)


def start_pipeline_run(db: Session, source: str | None = None) -> PipelineRun:
    """Create the pipeline_run row (status=started) and commit immediately, so a
    crash mid-run leaves a visibly stuck row rather than no record at all."""
    run = PipelineRun(
        started_at=datetime.now(UTC),
        status=PipelineRunStatus.STARTED,
        source=source or DEFAULT_SAMPLE_SOURCE,
        total_records=0,
        valid_records=0,
        invalid_records=0,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def execute_pipeline_run(db: Session, run: PipelineRun) -> PipelineRun:
    """Run load -> validate -> normalize -> store for an already-created run row.

    Shared by both the synchronous path (run_pipeline, below) and the async
    Prefect task (app/pipeline/prefect_flow.py), so pipeline logic lives in
    exactly one place regardless of which execution path triggered it.
    """
    source = run.source
    input_path = settings.pipeline_input_dir / source

    try:
        raw_records, parse_errors = load_records(input_path)
        valid, invalid = validate_records(raw_records)

        if parse_errors:
            sample = parse_errors[:20]
            log.warning(
                "pipeline run %s: %d NDJSON line(s) failed to parse and were skipped "
                "(showing up to 20): %s",
                run.id,
                len(parse_errors),
                sample,
            )

        if invalid:
            sample = invalid[:20]
            log.warning(
                "pipeline run %s: %d invalid record(s) skipped (showing up to 20): %s",
                run.id,
                len(invalid),
                sample,
            )

        _insert_new_records(db, valid, source)

        run.total_records = len(raw_records) + len(parse_errors)
        run.valid_records = len(valid)
        run.invalid_records = len(invalid) + len(parse_errors)
        run.status = PipelineRunStatus.COMPLETED
        run.finished_at = datetime.now(UTC)
        db.commit()
        db.refresh(run)
        log.info(
            "pipeline run %s completed: total=%d valid=%d invalid=%d",
            run.id,
            run.total_records,
            run.valid_records,
            run.invalid_records,
        )
        return run

    except Exception as exc:
        db.rollback()
        run.status = PipelineRunStatus.FAILED
        run.finished_at = datetime.now(UTC)
        run.error_message = str(exc)
        db.add(run)
        db.commit()
        log.exception("pipeline run %s failed", run.id)
        raise


def run_pipeline(db: Session, source: str | None = None) -> PipelineRun:
    """Synchronous entry point: create the run row and execute it inline,
    all within the current request. This is the default execution path."""
    run = start_pipeline_run(db, source)
    return execute_pipeline_run(db, run)


def _insert_new_records(db: Session, valid: list[RawDroneRecord], source: str) -> None:
    """Insert valid records as DroneRecord rows, letting the database itself skip ones
    already ingested from this exact source (idempotent re-ingest on
    UNIQUE(drone_id, timestamp, source)) via INSERT ... ON CONFLICT DO NOTHING.

    This must be a single atomic upsert rather than "SELECT existing, filter in Python,
    then INSERT": two pipeline runs for the same source can otherwise both see no
    existing rows, both attempt to insert the same batch, and the second commit crashes
    with IntegrityError instead of harmlessly no-op'ing.

    Timestamps are stored and compared as naive UTC: SQLite drops tzinfo on round-trip
    while Postgres keeps it, so naive-UTC-by-convention is what stays consistent across both.
    """
    seen_in_batch: set[tuple[str, datetime]] = set()
    values: list[dict] = []
    for record in valid:
        timestamp_utc = _to_naive_utc(record.timestamp)
        key = (record.drone_id, timestamp_utc)
        if key in seen_in_batch:
            continue
        seen_in_batch.add(key)
        values.append(
            {
                "drone_id": record.drone_id,
                "drone_type": record.drone_type,
                "operator_id": record.operator_id,
                "latitude": record.latitude,
                "longitude": record.longitude,
                "altitude_m": record.altitude_m,
                "speed_kmh": record.speed_kmh,
                "battery_percent": record.battery_percent,
                "timestamp": timestamp_utc,
                "status": record.status,
                "source": source,
            }
        )

    if not values:
        return

    dialect = db.get_bind().dialect.name
    insert = postgresql.insert if dialect == "postgresql" else sqlite.insert
    stmt = insert(DroneRecord).values(values).on_conflict_do_nothing(
        index_elements=["drone_id", "timestamp", "source"]
    )
    db.execute(stmt)
