import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.drone_record import DroneRecord
from app.models.enums import PipelineRunStatus
from app.models.pipeline_run import PipelineRun
from app.pipeline.loaders import load_records
from app.pipeline.run import run_pipeline


def test_valid_only_file_completes_with_no_invalid_records(db):
    run = run_pipeline(db, "sample_drones.json")

    assert run.status == PipelineRunStatus.COMPLETED
    assert run.total_records == 3
    assert run.valid_records == 3
    assert run.invalid_records == 0
    assert run.finished_at is not None

    rows = db.execute(select(DroneRecord)).scalars().all()
    assert len(rows) == 3


def test_mixed_file_stores_valid_and_skips_invalid(db):
    run = run_pipeline(db, "sample_drones_mixed.json")

    assert run.status == PipelineRunStatus.COMPLETED
    assert run.total_records == 3
    assert run.valid_records == 2
    assert run.invalid_records == 1

    rows = db.execute(select(DroneRecord)).scalars().all()
    assert len(rows) == 2


def test_csv_source_is_supported(db):
    run = run_pipeline(db, "sample_drones.csv")

    assert run.status == PipelineRunStatus.COMPLETED
    assert run.valid_records == 2
    assert run.invalid_records == 1


def test_rerunning_same_source_is_idempotent(db):
    first = run_pipeline(db, "sample_drones.json")
    second = run_pipeline(db, "sample_drones.json")

    assert first.valid_records == second.valid_records == 3
    rows = db.execute(select(DroneRecord)).scalars().all()
    assert len(rows) == 3  # no duplicates inserted on the second run


def test_missing_source_file_marks_run_failed(db):
    with pytest.raises(FileNotFoundError):
        run_pipeline(db, "does_not_exist.json")

    runs = db.execute(select(PipelineRun)).scalars().all()
    assert len(runs) == 1
    assert runs[0].status == PipelineRunStatus.FAILED
    assert runs[0].error_message


def test_ndjson_source_counts_parse_failures_as_invalid(db):
    run = run_pipeline(db, "sample_drones.ndjson")

    assert run.status == PipelineRunStatus.COMPLETED
    assert run.total_records == 4
    assert run.valid_records == 2
    assert run.invalid_records == 2

    rows = db.execute(select(DroneRecord)).scalars().all()
    assert len(rows) == 2


def test_ndjson_loader_reports_parse_errors_with_details():
    path = settings.pipeline_input_dir / "sample_drones.ndjson"
    records, parse_errors = load_records(path)

    assert len(records) == 3  # 2 valid + 1 pydantic-invalid but well-formed JSON; blank line skipped
    assert len(parse_errors) == 1

    error = parse_errors[0]
    assert error["line_number"] == 4
    assert error["raw_line"] == (
        '{"drone_id": "DRONE-008", "drone_type": "Quadcopter", '
        '"operator_id": "OP-456", "latitude": 31.95,}'
    )
    assert isinstance(error["error"], str) and error["error"]
