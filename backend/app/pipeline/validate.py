from pydantic import ValidationError

from app.schemas.drone import RawDroneRecord


def validate_records(raw_records: list[dict]) -> tuple[list[RawDroneRecord], list[dict]]:
    """Validate raw dicts against RawDroneRecord, splitting into valid/invalid.

    Invalid entries carry the original row, its index, and the Pydantic errors,
    so the caller can report exactly what was wrong with each skipped record.
    """
    valid: list[RawDroneRecord] = []
    invalid: list[dict] = []

    for index, row in enumerate(raw_records):
        try:
            valid.append(RawDroneRecord.model_validate(row))
        except ValidationError as exc:
            invalid.append({"index": index, "row": row, "errors": exc.errors()})

    return valid, invalid
