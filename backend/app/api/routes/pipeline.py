from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.pipeline import PipelineRunRead, PipelineRunTrigger
from app.services.pipeline import list_pipeline_runs, trigger_pipeline_run

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/run", response_model=PipelineRunRead, status_code=201)
def run(payload: PipelineRunTrigger, db: Session = Depends(get_db)) -> PipelineRunRead:
    run = trigger_pipeline_run(db, payload.source)
    return PipelineRunRead.model_validate(run)


@router.get("/runs", response_model=list[PipelineRunRead])
def runs(
    limit: int = Query(default=20, ge=1, le=200), db: Session = Depends(get_db)
) -> list[PipelineRunRead]:
    rows = list_pipeline_runs(db, limit=limit)
    return [PipelineRunRead.model_validate(row) for row in rows]
