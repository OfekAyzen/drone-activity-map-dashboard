import csv
import json
from pathlib import Path


class UnsupportedFileType(ValueError):
    pass


def load_records(path: Path) -> list[dict]:
    """Load raw records from a JSON, NDJSON, or CSV file as plain dicts.

    No validation or type coercion happens here - that is Pydantic's job downstream.
    A single malformed line/row is skipped rather than aborting the whole load.
    """
    suffix = path.suffix.lower()
    if suffix == ".json":
        return _load_json(path)
    if suffix == ".ndjson":
        return _load_ndjson(path)
    if suffix == ".csv":
        return _load_csv(path)
    raise UnsupportedFileType(f"Unsupported input file type: {suffix}")


def _load_json(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig")
    data = json.loads(text)

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("records", "data"):
            if isinstance(data.get(key), list):
                return data[key]
    raise UnsupportedFileType(
        "JSON input must be a top-level array or an object with a 'records'/'data' array"
    )


def _load_ndjson(path: Path) -> list[dict]:
    records = []
    with path.open(encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records


def _load_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        records = []
        for row in reader:
            if not any((value or "").strip() for value in row.values()):
                continue
            cleaned = {
                (key or "").strip(): (value.strip() if isinstance(value, str) else value)
                for key, value in row.items()
            }
            records.append({key: (value if value != "" else None) for key, value in cleaned.items()})
        return records
