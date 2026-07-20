import pytest
from pydantic import ValidationError

from app.schemas.drone import RawDroneRecord


def test_valid_record_passes(valid_row):
    record = RawDroneRecord.model_validate(valid_row)
    assert record.drone_id == "DRONE-001"
    assert record.status.value == "active"


@pytest.mark.parametrize(
    "field, value",
    [
        ("drone_id", ""),
        ("latitude", 200),
        ("latitude", -91),
        ("longitude", 200),
        ("longitude", -181),
        ("altitude_m", -1),
        ("speed_kmh", -1),
        ("battery_percent", -1),
        ("battery_percent", 101),
        ("timestamp", "not-a-date"),
        ("status", "flying"),
    ],
)
def test_invalid_field_rejected(valid_row, field, value):
    row = {**valid_row, field: value}
    with pytest.raises(ValidationError) as exc_info:
        RawDroneRecord.model_validate(row)
    assert any(err["loc"] == (field,) for err in exc_info.value.errors())


def test_all_invalid_fields_reported_together(invalid_row):
    with pytest.raises(ValidationError) as exc_info:
        RawDroneRecord.model_validate(invalid_row)
    error_fields = {err["loc"][0] for err in exc_info.value.errors()}
    assert error_fields == {"drone_id", "latitude", "altitude_m", "battery_percent", "timestamp", "status"}


@pytest.mark.parametrize("status", ["active", "landed", "lost_signal"])
def test_allowed_status_values(valid_row, status):
    row = {**valid_row, "status": status}
    record = RawDroneRecord.model_validate(row)
    assert record.status.value == status


@pytest.mark.parametrize("battery", [0, 100])
def test_battery_boundary_values_are_valid(valid_row, battery):
    row = {**valid_row, "battery_percent": battery}
    record = RawDroneRecord.model_validate(row)
    assert record.battery_percent == battery


@pytest.mark.parametrize("lat,lng", [(-90, -180), (90, 180)])
def test_lat_lng_boundary_values_are_valid(valid_row, lat, lng):
    row = {**valid_row, "latitude": lat, "longitude": lng}
    record = RawDroneRecord.model_validate(row)
    assert record.latitude == lat
    assert record.longitude == lng
