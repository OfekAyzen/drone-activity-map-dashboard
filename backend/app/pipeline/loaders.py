import csv
import json
from pathlib import Path


class UnsupportedFileType(ValueError):
    pass


def load_records(path: Path) -> tuple[list[dict], list[dict]]:
    """Load raw records from a JSON, NDJSON, or CSV file as plain dicts.

    Returns (records, parse_errors). No validation or type coercion happens here -
    that is Pydantic's job downstream. parse_errors is always empty for JSON/CSV
    sources - only NDJSON can have individual lines that fail to parse as JSON at
    all; those are reported here instead of being silently dropped, so callers can
    count and log them rather than losing them with no trace.
    """
    suffix = path.suffix.lower()
    if suffix == ".json":
        return _load_json(path)
    if suffix == ".ndjson":
        return _load_ndjson(path)
    if suffix == ".csv":
        return _load_csv(path)
    raise UnsupportedFileType(f"Unsupported input file type: {suffix}")


def _load_json(path: Path) -> tuple[list[dict], list[dict]]:
    text = path.read_text(encoding="utf-8-sig")
    data = json.loads(text)

    if isinstance(data, list):
        return data, []
    if isinstance(data, dict):
        for key in ("records", "data"):
            if isinstance(data.get(key), list):
                return data[key], []
    raise UnsupportedFileType(
        "JSON input must be a top-level array or an object with a 'records'/'data' array"
    )


def _load_ndjson(path: Path) -> tuple[list[dict], list[dict]]:
    """Returns (records, parse_errors). Each parse_errors entry captures the
    1-based line number, the raw line content, and the JSONDecodeError message,
    so a mangled line is fully debuggable instead of vanishing with no trace."""
    records: list[dict] = []
    parse_errors: list[dict] = []
    with path.open(encoding="utf-8-sig") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                parse_errors.append(
                    {
                        "line_number": line_number,
                        "raw_line": line,
                        "error": str(exc),
                    }
                )
    return records, parse_errors


def _load_csv(path: Path) -> tuple[list[dict], list[dict]]:
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
        return records, []
