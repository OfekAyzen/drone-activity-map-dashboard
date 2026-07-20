from pydantic import BaseModel


class StatsRead(BaseModel):
    total_records: int
    avg_battery_percent: float | None
    by_status: dict[str, int]
    by_drone_type: dict[str, int]
