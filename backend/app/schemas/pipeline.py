from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import PipelineRunStatus


class PipelineRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    started_at: datetime
    finished_at: datetime | None
    status: PipelineRunStatus
    source: str
    total_records: int
    valid_records: int
    invalid_records: int
    error_message: str | None


class PipelineRunTrigger(BaseModel):
    source: str | None = None
