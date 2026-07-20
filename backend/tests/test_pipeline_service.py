from app.models.enums import PipelineRunStatus
from app.services.pipeline import trigger_pipeline_run


def test_sync_path_when_prefect_not_configured(db, monkeypatch):
    monkeypatch.delenv("PREFECT_API_URL", raising=False)

    run = trigger_pipeline_run(db, "sample_drones.json")

    assert run.status == PipelineRunStatus.COMPLETED
    assert run.valid_records == 3
    assert run.invalid_records == 0


def test_dispatches_to_prefect_when_configured(db, monkeypatch):
    monkeypatch.setenv("PREFECT_API_URL", "http://prefect-server:4200/api")

    calls = []

    def fake_run_deployment(*, name, parameters, timeout):
        calls.append({"name": name, "parameters": parameters, "timeout": timeout})

    monkeypatch.setattr("prefect.deployments.run_deployment", fake_run_deployment)

    run = trigger_pipeline_run(db, "sample_drones.json")

    # Dispatched, not executed inline - the (mocked-away) worker would do that.
    assert run.status == PipelineRunStatus.STARTED
    assert run.valid_records == 0
    assert len(calls) == 1
    assert calls[0]["name"] == "ingest-drone-records/drone-ingest"
    assert calls[0]["parameters"] == {"pipeline_run_id": run.id}
    assert calls[0]["timeout"] == 0


def test_falls_back_to_sync_when_dispatch_fails(db, monkeypatch):
    monkeypatch.setenv("PREFECT_API_URL", "http://prefect-server:4200/api")

    def failing_run_deployment(*, name, parameters, timeout):
        raise ConnectionError("no worker registered for this deployment")

    monkeypatch.setattr("prefect.deployments.run_deployment", failing_run_deployment)

    run = trigger_pipeline_run(db, "sample_drones.json")

    # Same run row (no duplicate), completed inline despite Prefect being "configured".
    assert run.status == PipelineRunStatus.COMPLETED
    assert run.valid_records == 3
