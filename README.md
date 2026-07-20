# Drone Activity Map Dashboard

A small full-stack exercise: a FastAPI + SQLAlchemy + PostgreSQL backend ingests
simulated drone telemetry through a validate/normalize/store pipeline, and an
Angular + Leaflet frontend displays the resulting drone positions on a map with
filters and pipeline-run visibility.

> The coordinates are real map locations; the drone activity itself is simulated
> and does not represent real drone operations.

## Features

- Ingestion pipeline that loads drone records from JSON or CSV files, validates
  every field, skips invalid rows without aborting the run, and records
  per-run counters (total / valid / invalid) and status.
- REST API (`/api/drones`, `/api/drones/{id}`, `/api/pipeline/run`,
  `/api/pipeline/runs`, `/api/stats`) with typed filters and offset/limit
  pagination.
- Angular dashboard: Leaflet map with status-colored markers, marker popups
  with full drone detail, a filter panel (type, status, operator, min battery,
  date range), and a pipeline control panel with a run-history table.
- Bonus features implemented: low-battery (<20%) and lost-signal markers are
  styled distinctly, the map defaults to showing only the latest position per
  drone (toggleable), clicking a drone draws its historical path, and the
  pipeline can optionally run asynchronously via a self-hosted Prefect
  flow + worker instead of inline in the request (see below).
- Idempotent re-ingestion: re-running the pipeline against the same file does
  not duplicate rows already stored from that source.

## Quick start (Docker)

```bash
docker compose up --build
```

- Frontend: http://localhost:4200
- API docs: http://localhost:8000/docs

Verified: `docker compose up --build` brings up `db` (Postgres, healthy),
`api` (runs `alembic upgrade head` then serves FastAPI), and `web` (Angular
built and served via nginx, proxying `/api/` to `api`). Confirmed working
end-to-end - pipeline trigger, drone filtering, and the map UI - through the
containers, not just locally.

## Async pipeline execution (Prefect, bonus)

By default, `POST /api/pipeline/run` runs the pipeline inline and returns once
it's done - fine at this dataset size, and the core requirement never depends
on extra infrastructure being up. A second, opt-in mode dispatches the run to
a self-hosted [Prefect](https://www.prefect.io/) flow instead, returning
immediately with `status: "started"`; the frontend polls until it completes.

```bash
docker compose -f docker-compose.yml -f docker-compose.prefect.yml up --build
```

This adds two containers on top of the base stack: `prefect-server` (UI at
http://localhost:4201) and `worker` (runs `ingest_flow.serve(...)`, which both
registers the deployment and executes runs against it). No separate flag or
env var to remember - the overlay file itself is what sets `PREFECT_API_URL`
on `api`, so plain `docker compose up` (no overlay) is completely unaffected
and behaves exactly as in the Quick Start above.

Without the overlay, `api` never sees `PREFECT_API_URL`, so
`trigger_pipeline_run()` (`app/services/pipeline.py`) takes the synchronous
path with zero added latency - see the Design decisions below for why this
wasn't made the default.

In the UI, clicking "Run Pipeline" adds a new row to the runs table with an
amber "started" badge right away, then `DashboardStore` polls
`GET /api/pipeline/runs` every 1.5s until that run's status changes, flipping
the badge to "completed" (or "failed") and refreshing the map - no page
reload. In the default synchronous mode this happens instantly since the run
is already finished by the time the request resolves, so the badge goes
straight to "completed"/"failed" with no polling.

## Quick start (manual)

### Backend

```bash
cd backend
python -m venv .venv
./.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

The default `DATABASE_URL` is a local SQLite file (`backend/drone.db`) so this
runs with zero external setup. Point `DATABASE_URL` at Postgres (see
Configuration below) to match the Docker Compose setup.

Sample input files already live in `backend/data/incoming/`:
`sample_drones.json` (all valid), `sample_drones_mixed.json` (valid + invalid,
matching the exercise's example records), and `sample_drones.csv`. Trigger the
pipeline via the API (`POST /api/pipeline/run`) or the frontend's "Run
Pipeline" button once both are running.

### Frontend

```bash
cd frontend
npm install
npm start   # ng serve --proxy-config proxy.conf.json, proxies /api to :8000
```

Open http://localhost:4200.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./drone.db` (backend-relative) | SQLAlchemy connection string. Docker Compose overrides this to `postgresql+psycopg://drone:drone@db:5432/drone`. |
| `CORS_ORIGINS` | `http://localhost:4200` | Comma-separated list of allowed origins for the FastAPI CORS middleware. |
| `PIPELINE_INPUT_DIR` | `data/incoming` (backend-relative) | Directory the pipeline reads source files from. |
| `PREFECT_API_URL` | unset | Only set by `docker-compose.prefect.yml`. When present, pipeline runs dispatch to Prefect instead of running inline. |

Copy `.env.example` to `.env` at the repo root and adjust as needed; the
backend loads it via `python-dotenv`.

## API

Full interactive reference: http://localhost:8000/docs (FastAPI's
auto-generated OpenAPI UI) once the backend is running.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/pipeline/run` | Trigger the ingestion pipeline against a source file (body: `{"source": "sample_drones.json"}`, optional). |
| `GET` | `/api/pipeline/runs` | Recent pipeline execution history. |
| `GET` | `/api/drones` | Drone records, filterable by `drone_id`, `drone_type`, `status`, `operator_id`, `min_battery`, `from`/`to`, paginated via `limit`/`offset`. |
| `GET` | `/api/drones/{id}` | A single drone record by its row id. |
| `GET` | `/api/stats` | Summary statistics (total records, average battery, counts by status/type). |

## Architecture

```
backend/app/
  api/routes/    FastAPI routers - HTTP only, no business logic or SQL
  services/      query building, pipeline orchestration
  pipeline/      load -> validate -> normalize -> store (+ prefect_flow.py/worker.py for the async path)
  models/        SQLAlchemy ORM (drone_record, pipeline_run)
  schemas/       Pydantic contracts (validation + API request/response)
  db/, core/     session/engine, settings, logging

frontend/src/app/
  core/          models, HTTP services, DashboardStore (signals-based state)
  shared/        presentational components (map, filter panel, pipeline panel)
  features/      dashboard/ - the smart component wiring store to shared UI
```

Backend layering is `routes -> services` (no separate repository layer - the
codebase is two tables and five endpoints, and a repository layer wasn't
earning its keep at that scale). The pipeline runs synchronously inside the
`POST /api/pipeline/run` request/response cycle. See [PLAN.md](PLAN.md) for
the full phase-by-phase implementation plan, including the assumptions listed
below and how each phase was scoped against the source skills in
`.claude/skills/`.

### Pipeline flow

1. **Load** - `app/pipeline/loaders.py` reads JSON (array, `{"records":[...]}`,
   or NDJSON) or CSV into plain dicts, with no validation at this stage.
2. **Validate** - `app/pipeline/validate.py` runs each dict through
   `RawDroneRecord` (Pydantic), splitting into valid records and invalid
   entries (each carrying its index, original row, and error list).
3. **Normalize** - timestamps are converted to naive UTC (chosen so
   comparisons are consistent across SQLite, which drops tzinfo on
   round-trip, and Postgres, which keeps it).
4. **Store** - a `pipeline_run` row is created with `status="started"` and
   committed immediately, so a crash mid-run leaves a visibly stuck row
   rather than silence. Valid rows are deduplicated against
   `(drone_id, timestamp, source)` already in the database, then bulk
   inserted. The run is then marked `completed` (with counters) or `failed`
   (with the error message, on rollback).

## Testing

```bash
# Backend (40 tests: validation rules, pipeline outcomes/idempotency, sync/async dispatch branching, API filters/pagination/404/422)
cd backend && ./.venv/Scripts/python.exe -m pytest -q

# Frontend (16 tests: service HTTP param building, filter panel, Leaflet map rendering/reactivity)
cd frontend && npm test
```

## Design decisions & trade-offs

- **Map library: Leaflet** (the exercise's spec allows Leaflet, MapLibre, or
  OpenLayers; Leaflet was chosen over the initially-planned MapLibre GL).
- **`GET /api/drones/{id}`** is the record's own surrogate primary key, not
  the business `drone_id` - each ingested telemetry reading is its own row.
  Fetching a drone's full history is `GET /api/drones?drone_id=X`.
- **`pipeline_run.status`** uses exactly the three values from the spec
  (`started`/`completed`/`failed`); a run with some invalid rows is still
  `completed`, with `invalid_records > 0` signaling partial success.
- **DB engine**: SQLite by default for zero-setup local runs; Docker Compose
  switches `DATABASE_URL` to Postgres. The schema avoids Postgres-only
  features so it works identically on both.
- **Idempotent re-ingest** (`UNIQUE(drone_id, timestamp, source)`, skip
  on conflict) isn't required by the spec but prevents duplicate rows if
  "Run Pipeline" is clicked more than once against the same file.
- **Pipeline trigger** reads one named file per run (`POST` body
  `{"source": "..."}`, defaulting to `sample_drones.json`) rather than
  sweeping a whole folder.
- **Synchronous by default, Prefect as an opt-in overlay, not a replacement**:
  the sample datasets are small enough that synchronous execution has no
  downside, and the core pipeline requirement shouldn't depend on extra
  infrastructure (a Prefect server + worker) being healthy. See "Async
  pipeline execution" above.
- **Map fetch strategy**: filters alone drive refetching; there's no
  pan-to-refetch (bbox-on-`moveend`) behavior, since the spec only asks for
  the listed dropdown/date filters.
- **Frontend Dockerfile pins `node:22-alpine`** (not 20, which is below
  Angular 22's minimum supported Node version and fails the container build
  outright - caught by actually running `docker compose up --build`).

## Project structure

```
.
├── PLAN.md                  Full implementation plan (phases, decisions, assumptions)
├── docker-compose.yml
├── docker-compose.prefect.yml   Async pipeline overlay (prefect-server + worker)
├── .env.example
├── backend/
│   ├── app/                 FastAPI app (see Architecture above)
│   ├── alembic/             DB migrations
│   ├── data/incoming/       Sample input files (valid + invalid records)
│   ├── tests/                pytest suite
│   ├── Dockerfile
│   └── requirements.txt
└── frontend/
    ├── src/app/              Angular app (see Architecture above)
    ├── Dockerfile
    └── nginx.conf
```
