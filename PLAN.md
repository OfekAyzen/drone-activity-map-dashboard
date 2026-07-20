# Drone Activity Map Dashboard — Implementation Plan

## Context

This is a take-home technical exercise (`Full_Stack_Developer_Technical_Exercise_Drone_Map_Dashboard.docx`): ingest simulated drone telemetry, validate/normalize/store it via a Python pipeline, and expose it to an Angular map dashboard with filters and pipeline-run visibility. The repo already has `claude.md` (stack/conventions) and 22 `.claude/skills/*` files encoding detailed implementation patterns for each concern (DB design, SQLAlchemy, Alembic, Pydantic, ETL, FastAPI, Angular structure/state/RxJS/mapping, testing, Docker, docs). This plan sequences the build across those skills, resolves conflicts found between them, and reconciles them with the exercise's actual requirements (which use "drone" domain language, not the skills' generic "activity" examples).

Decisions already made with you:
- **Map library: Leaflet** (not MapLibre GL as `claude.md` currently states — `claude.md` needs a one-line update during Phase 1 to stop contradicting this).
- **Backend layering: routes → services only** (no separate `repositories/` layer).
- **Pipeline source: local JSON + CSV files, processed synchronously** on `POST /api/pipeline/run` (no background worker/Celery/Prefect).
- **Bonus scope:** low-battery & lost-signal marker styling, latest-position-only default map view, drone path history on selection. (Docker Compose and pagination are core, not bonus, per `claude.md`/skills.)
- **Local execution**: Python 3.12 has been installed on this machine (via winget) specifically so the backend can actually be run and tested locally (pytest, alembic, uvicorn) as it's built, not just written blind.
- **Execution mode**: once this plan is approved, execute all 13 phases autonomously without pausing for per-phase approval — only stopping for a genuine blocker or a decision that materially changes scope.
- **Plan artifact**: in addition to this plan file, commit a copy as `PLAN.md` at the repo root (per project-documentation conventions) so it travels with the submission as the "short explanation of the pipeline flow" / design-notes deliverable.

## Assumptions (not yet confirmed — flagging, not blocking)

1. **`GET /api/drones/{id}`** — the spec doesn't say whether `{id}` is the record's own surrogate primary key or the business `drone_id`. Assumption: it's the row's PK (`id`), consistent with each ingested telemetry record being its own row (see Phase 2). `drone_id` remains a filterable field on the list endpoint, and is also how "path history" is fetched (`GET /api/drones?drone_id=X`, sorted by timestamp) — no new endpoint needed for that bonus.
2. **`pipeline_run.status`** — the spec explicitly lists only `started | completed | failed` (§3.2), unlike some skills' `success/partial/failed`. Assumption: use the spec's exact 3 values; a run with some invalid rows is still `completed`, with `invalid_records > 0` communicating partial success.
3. **DB engine** — `claude.md` commits to PostgreSQL; skills suggest SQLite for tests. Assumption: Postgres via Docker Compose for dev/run, in-memory SQLite only inside pytest fixtures for speed (test-internal detail, not user-facing).
4. **Idempotent re-ingest** — not requested by the spec, but cheap and prevents duplicate rows if "Run Pipeline" is clicked twice on the same file. Assumption: add `UNIQUE(drone_id, timestamp, source)` and skip-on-conflict during store.
5. **Pipeline trigger payload** — spec doesn't define how `POST /api/pipeline/run` picks its input file. Assumption: request body `{"source": "sample_drones.json"}` (optional), defaulting to a fixed sample file living in `backend/data/incoming/`; the pipeline reads that one file per run (not a whole-folder sweep).
6. **`GET /api/stats`** — marked "Optional" in the spec's own API table. Assumption: implement a minimal version (counts by status/type, avg battery, total valid records) since it's low effort, but treat it as lowest priority if time runs short.
7. **Map fetch strategy** — the `web-mapping`/`rxjs-httpclient` skills suggest viewport-driven (bbox on `moveend`) fetching. The spec only asks for the listed dropdown/date filters, not pan-to-refetch. Assumption: skip bbox-on-pan (avoids scope creep beyond what's asked); filters alone drive refetching.

## Phase 1 — Repo scaffolding & environment

- Root layout per `git-workflow`: `backend/`, `frontend/`, `docker-compose.yml`, `README.md`, `.gitignore`, `.env.example`.
- Update `claude.md`'s stack line from "MapLibre GL" → "Leaflet" (resolve the contradiction now, before it misleads later work).
- `.gitignore`: Python (`__pycache__/`, `.venv/`, `*.db`), Node (`node_modules/`, `frontend/dist/`, `.angular/`), secrets (`.env`), editor/OS junk.
- Backend skeleton dirs: `app/{api,models,schemas,services,pipeline,db,core}`, `tests/` (mirrors `app/`), `data/incoming/` (sample files), `alembic/`.
- Frontend skeleton: standard Angular CLI standalone app with `core/`, `features/`, `shared/` per `angular-app-structure`.

## Phase 2 — Database schema & migrations

Per `relational-db-design` + `sqlalchemy-orm` + `alembic-migrations`, using the spec's own field names (not the skills' generic "activity" naming):

- **`drone_record`** (fact table, one row per ingested telemetry reading): `id` (PK), `drone_id`, `drone_type`, `operator_id`, `latitude`, `longitude`, `altitude_m`, `speed_kmh`, `battery_percent`, `timestamp` (UTC), `status` (enum: `active|landed|lost_signal`), `source` (input filename), `ingested_at`. Indexes: `drone_id`, `timestamp`, composite `(latitude, longitude)`, `UNIQUE(drone_id, timestamp, source)`.
- **`pipeline_run`**: `id`, `started_at`, `finished_at`, `status` (enum: `started|completed|failed`), `total_records`, `valid_records`, `invalid_records`, `error_message`.
- SQLAlchemy 2.0 typed `Mapped[]`/`mapped_column` style; `db.py` with `create_engine(DATABASE_URL, pool_pre_ping=True)`, `sessionmaker(expire_on_commit=False)`.
- `alembic init`, wire `env.py` to `Base.metadata`, generate + hand-review first migration, write real `downgrade()`.

## Phase 3 — Pydantic schemas & validation

Per `pydantic-schemas`, enforcing spec §3.3 exactly:

- `DroneStatus` enum shared between API and pipeline.
- `RawDroneRecord` (lenient, for pipeline validation) with `@field_validator`s: `drone_id` non-empty, `latitude` -90..90, `longitude` -180..180, `altitude_m` >= 0, `battery_percent` 0..100, `timestamp` valid ISO datetime, `status` in allowed enum.
- `DroneRecordCreate` / `DroneRecordRead` (`ConfigDict(from_attributes=True)`) / `DronePage` envelope (`items/total/limit/offset`).
- `PipelineRunRead` schema matching the table in Phase 2.

## Phase 4 — Data ingestion pipeline

Per `data-file-parsing` + `etl-pipeline` + `error-handling-logging`:

- `load_records()`: dispatch by extension, JSON (array/`{"records":[...]}`/NDJSON) and CSV (`DictReader`, `utf-8-sig`) loaders, returning plain dicts only — no validation at this stage.
- `validate_records()`: run each dict through `RawDroneRecord`, split into `(valid, invalid)`, invalid entries carry `{index, row, errors}`.
- Normalize: UTC timestamp conversion, trim/normalize `drone_id`/`operator_id`, set `source` = input filename.
- Store: create `pipeline_run` row with `status="started"` and commit immediately (so a crash leaves a visible stuck run); bulk `add_all` valid rows (skip-on-conflict per the idempotency assumption); on success set `status="completed"` with counters; on exception, rollback, set `status="failed"` + `error_message`, re-raise (logged via `log.exception`).
- Central `configure_logging()` in `app/core`, called once from `main.py`.
- Two sample input files under `backend/data/incoming/`: one all-valid (can reuse the spec's 3-record example), one mixed valid/invalid (using the spec's invalid-record example) — satisfies the "example input file with valid and invalid records" deliverable.

## Phase 5 — FastAPI endpoints & services

Per `fastapi-rest-endpoints` + `rest-api-design` (routes → services, no repositories layer):

- `app/api/deps.py`: `get_db()` session-per-request generator.
- `app/services/drones.py`: `query_drones(db, filters, limit, offset)` — builds one `select(DroneRecord)` with conditional `.where()` per filter (`drone_type`, `status`, `operator_id`, `min_battery`, `from`/`to` on `timestamp`), returns `(rows, total)`.
- `app/services/pipeline.py`: `run_pipeline(db, source)` wrapping Phase 4's pipeline; `list_pipeline_runs(db, limit)`.
- Routes: `GET /api/drones` (typed `Query()` filters + pagination → `DronePage`), `GET /api/drones/{id}` (`db.get`, 404 if missing), `POST /api/pipeline/run`, `GET /api/pipeline/runs`, `GET /api/stats` (minimal, per assumption 6).
- `main.py`: app assembly, `CORSMiddleware` with origins from `CORS_ORIGINS` env var, router registration, `configure_logging()` on startup, catch-all exception handler (log full traceback, return generic `{"detail": ...}`).

## Phase 6 — Backend tests

Per `pytest-backend-testing`:

- `conftest.py`: `db` fixture (fresh in-memory SQLite + `create_all()` per test), `client` fixture (overrides `get_db`), `sample_rows` fixture (valid + invalid).
- `test_validation.py`: unit tests on `RawDroneRecord` covering every §3.3 rule.
- `test_pipeline.py`: integration — completed/failed outcomes, correct counters, idempotent re-run doesn't duplicate.
- `test_drones_api.py`: filter combinations, pagination, 404 on missing id, 422 on bad query params.

## Phase 7 — Frontend foundation

Per `angular-app-structure` + `typescript-essentials`:

- `core/models`: `DroneRecord`, `DroneFilters`, `Page<T>`, `PipelineRun` interfaces mirroring the Pydantic `Read` schemas exactly; `status`/`drone_type` as string-literal unions, not TS enums.
- `environment.apiBase` single source of truth for the API URL; `proxy.conf.json` mapping `/api` → backend, so dev stays same-origin (no CORS in dev).
- `provideHttpClient()`, `provideRouter()` in `app.config.ts`; dashboard as default route.

## Phase 8 — State management & API services

Per `angular-ui-state` + `rxjs-httpclient` + `fe-be-integration-cors`:

- `DashboardStore` (`providedIn:'root'`, signals): `filters`, `items`, `loading`, `error`, `latestOnly` (defaults `true` per bonus scope), plus `computed()` `visibleItems` (dedupes to latest-per-`drone_id` when `latestOnly` is set).
- `DroneService`/`PipelineService`: typed `HttpParams` built per filter field, `Observable<Page<DroneRecord>>`; filter changes flow through a `Subject` + `debounceTime` + `switchMap`; filter changes reset `offset` to 0.
- One `errorInterceptor` (via `provideHttpClient(withInterceptors([...]))`) normalizing `{detail}` errors into friendly messages — components never see raw HTTP errors.
- Pipeline trigger: `POST` then immediate `store.refresh()` of both drones and runs (no polling needed since Phase 4 is synchronous).

## Phase 9 — Map dashboard (Leaflet) + path history/styling bonuses

Per `web-mapping` (Leaflet API directly, no MapLibre translation needed) + `dashboard-html-css`:

- `MapComponent`: purely presentational, `@Input() points`, `@Output() droneSelected`; `L.map` created in `ngOnInit`, one `L.layerGroup` cleared/repopulated on `ngOnChanges` (never recreate the map).
- Markers: `L.circleMarker` (no image-asset 404 risk) colored by `status`; `battery_percent < 20` and `status === 'lost_signal'` get distinct styling (shared CSS custom-property palette with the runs-table status badges).
- Popup shows all 8 required fields (drone id/type/operator/altitude/speed/battery/status/last update).
- Path history bonus: on marker click, `DashboardStore` (or a direct service call) fetches `GET /api/drones?drone_id=X` sorted by timestamp, and the map draws an `L.polyline` of those points — reuses the existing filter endpoint, no new API needed.
- Map container needs explicit height + `min-height: 0` on its grid cell (the classic Leaflet-collapses-to-0px gotcha).

## Phase 10 — Filters & pipeline control panel UI

Per `dashboard-html-css` + `angular-ui-state`:

- Filter form (drone type, status, operator id, min battery, date range) with `Apply`/`Reset`, writing to `store.patchFilters()`.
- Pipeline control panel: "Run Pipeline" button → `POST /api/pipeline/run` → refresh; runs table (date, status, valid/invalid counts) with color-coded status badges matching the map's palette.
- CSS Grid page shell (header/sidebar/map/panel), `100vh` shell, single-column responsive breakpoint that still prioritizes map height.

## Phase 11 — Frontend tests

Per `angular-frontend-testing`:

- Service tests via `TestBed` + `HttpTestingController`: assert exact URL/query params per filter, typed `flush()`, `httpMock.verify()`.
- Component tests: filter panel emits correct filter patches; map component reacts to `@Input()` changes and emits `droneSelected`/output events (don't test Leaflet internals directly).

## Phase 12 — Docker Compose

Per `docker-compose-stack`:

- Backend `Dockerfile`: `python:3.12-slim`, install deps, CMD `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Frontend `Dockerfile`: multi-stage `node:20-alpine` build → `nginx:alpine` serve; nginx proxies `/api/` to the `api` service, SPA fallback for `/`.
- `docker-compose.yml`: `db` (postgres:16-alpine, named volume, healthcheck), `api` (`depends_on: db: condition: service_healthy`), `web` (`depends_on: [api]`); config via env vars (`DATABASE_URL`, `CORS_ORIGINS`).
- Per-service `.dockerignore`.
- **Post-write correction, found by actually running `docker compose up --build`**: `node:20-alpine` is below Angular 22's minimum supported Node version and fails the `web` image build outright. Bumped to `node:22-alpine`. Verified afterward: all three services (`db` healthy, `api` migrates+serves, `web` builds+proxies) come up clean, and the pipeline-trigger/filter/map flow works through the containers exactly as it does locally.

## Phase 13 — Documentation & submission polish

Per `project-documentation` + `git-workflow`:

- README: summary → features → quick start (Docker: `docker compose up --build`) → quick start (manual: venv/alembic/uvicorn, then npm/ng serve) → config table (env vars + defaults) → API list (link `/docs`) → architecture (prose, brief diagram) → testing commands → design decisions/trade-offs (state the assumptions above honestly) → project structure tree.
- Verify every printed command actually works from a clean checkout/clone.
- Final `git status`/`git clean -ndx` check: no `node_modules`, `.db` files, or `.env` committed; conventional-commit history if not already followed incrementally.

## Verification

- Backend: `pytest` (all of Phase 6) green; manually hit `POST /api/pipeline/run` against both sample files and confirm `pipeline_run` counters match the known valid/invalid split; hit `/docs` and exercise each `/api/drones` filter combination and `/api/drones/{id}` 404 case.
- Frontend: `ng test` (Phase 11) green; manually run `ng serve`, trigger the pipeline from the UI, confirm markers appear/update, filters refetch and reset pagination, low-battery/lost-signal styling and path-history polyline render correctly on the sample data.
- End-to-end: `docker compose up --build` from a clean checkout, confirm frontend (`:4200`) and API (`:8000/docs`) both come up healthy and the full flow (run pipeline → see markers → filter → click drone → see path) works without manual intervention.
