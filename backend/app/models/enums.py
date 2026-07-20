import enum


class DroneStatus(str, enum.Enum):
    ACTIVE = "active"
    LANDED = "landed"
    LOST_SIGNAL = "lost_signal"


class PipelineRunStatus(str, enum.Enum):
    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"
