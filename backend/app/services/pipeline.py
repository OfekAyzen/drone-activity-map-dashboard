import logging
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.pipeline_run import PipelineRun
from app.pipeline.run import execute_pipeline_run, run_pipeline, start_pipeline_run

log = logging.getLogger(__name__)


def trigger_pipeline_run(db: Session, source: str | None) -> PipelineRun:
    """Run the pipeline synchronously, unless a Prefect deployment is configured
    (PREFECT_API_URL set - only true when running the `prefect` compose overlay),
    in which case dispatch to it and return immediately with the run still `started`.
    """
    if not os.getenv("PREFECT_API_URL"):
        return run_pipeline(db, source)

    run = start_pipeline_run(db, source)
    try:
        from prefect.deployments import run_deployment

        from app.pipeline.prefect_flow import DEPLOYMENT_FULL_NAME

        run_deployment(
            name=DEPLOYMENT_FULL_NAME,
            parameters={"pipeline_run_id": run.id},
            timeout=0,
        )
        log.info("pipeline run %s dispatched to Prefect", run.id)
        return run
    except Exception:
        log.exception(
            "failed to dispatch pipeline run %s to Prefect; falling back to synchronous execution",
            run.id,
        )
        return execute_pipeline_run(db, run)


def list_pipeline_runs(db: Session, limit: int = 20) -> list[PipelineRun]:
    stmt = select(PipelineRun).order_by(PipelineRun.started_at.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())
