"""Async execution path (bonus): the same ingest logic as run_pipeline(),
run by a Prefect worker instead of inline in the API request.

FLOW_NAME/DEPLOYMENT_NAME identify the deployment created by `ingest_flow.serve()`
(see worker.py) - app/services/pipeline.py triggers runs against this same name.
"""

import logging

from prefect import flow, task

from app.db.session import SessionLocal
from app.models.pipeline_run import PipelineRun
from app.pipeline.run import execute_pipeline_run

log = logging.getLogger(__name__)

FLOW_NAME = "ingest-drone-records"
DEPLOYMENT_NAME = "drone-ingest"
DEPLOYMENT_FULL_NAME = f"{FLOW_NAME}/{DEPLOYMENT_NAME}"


@task(name="execute-drone-ingest")
def execute_ingest_task(pipeline_run_id: int) -> str:
    # A worker runs in its own process from the API's request - it must open
    # its own DB session rather than reuse one from the triggering request.
    db = SessionLocal()
    try:
        run = db.get(PipelineRun, pipeline_run_id)
        if run is None:
            raise ValueError(f"pipeline_run {pipeline_run_id} not found")
        execute_pipeline_run(db, run)
        return run.status.value
    finally:
        db.close()


@flow(name=FLOW_NAME)
def ingest_flow(pipeline_run_id: int) -> str:
    return execute_ingest_task(pipeline_run_id)
