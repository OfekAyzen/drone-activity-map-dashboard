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

## Phase 15 — Async pipeline execution via Prefect (bonus)

Added after the initial submission, at your request, to cover the "Prefect/Celery/background worker" bonus explicitly declined earlier (see the background-workers skill). Self-hosted (no Prefect Cloud account), opt-in via a second compose file rather than replacing the default synchronous path - see the chat discussion for why (core requirement shouldn't depend on the bonus's infrastructure working).

- `app/pipeline/run.py` split into `start_pipeline_run()` (creates the row) + `execute_pipeline_run()` (does the work) + `run_pipeline()` (thin sync wrapper calling both) - one shared implementation for both execution paths, no duplicated pipeline logic.
- `app/pipeline/prefect_flow.py`: `@flow ingest_flow(pipeline_run_id)` calling `@task execute_ingest_task`, which loads the existing run row and calls `execute_pipeline_run()`.
- `app/pipeline/worker.py`: entry point that calls `ingest_flow.serve(name=DEPLOYMENT_NAME)` - registers the deployment *and* executes runs against it, no separate work-pool/`prefect worker start` step needed.
- `app/services/pipeline.py`: `trigger_pipeline_run()` branches on whether `PREFECT_API_URL` is set in the environment (zero network calls, zero latency when it isn't - true for every test run and the default compose stack). When set, calls `run_deployment(..., timeout=0)` to dispatch and return immediately; falls back to synchronous execution on the *same* run row if dispatch itself raises.
- `docker-compose.prefect.yml`: overlay file (not Compose profiles - profiles can't conditionally add an env var to an already-defined service) adding `PREFECT_API_URL` to `api`, plus new `prefect-server` and `worker` services. Demo: `docker compose -f docker-compose.yml -f docker-compose.prefect.yml up --build`. Prefect UI on `:4201` (`:4200` is already the frontend's port).
- Frontend (`DashboardStore.runPipeline`) polls `GET /api/pipeline/runs` when a triggered run comes back `status: started`, until it resolves, then refreshes - see Phase 16.

**Non-obvious bug found and fixed during implementation**: Prefect's `.serve()` runs each flow in a subprocess and `cloudpickle`s the flow to hand it off. A task/flow body that references the module-level `SessionLocal` (a `sessionmaker` *instance* already bound to a live `Engine`) can't be pickled - cloudpickle must serialize it by value (it's not a class/function it can reference by name), which drags in the connection pool's unpicklable `threading.RLock`. Fixed by adding `create_session()` to `app/db/session.py`, which builds a fresh engine/session at call time instead of closing over the pre-bound global - confirmed via a series of isolated repro scripts (see chat) before touching the real code.

**Status: done and verified.** Backend tests green (40, including 3 new ones in `tests/test_pipeline_service.py` for the sync/async/fallback branches). Verified live end-to-end via `docker compose -f docker-compose.yml -f docker-compose.prefect.yml up --build`: all 5 containers healthy, triggered `POST /api/pipeline/run` returned `status: started` immediately, polling `GET /api/pipeline/runs` showed it flip to `completed` a few seconds later (worker picked it up via Prefect), Prefect UI reachable on `:4201`. Also reconfirmed the plain `docker compose up` (no overlay) still has no `PREFECT_API_URL` on `api` - default path unaffected. Committed as "Phase 15: Add Prefect flow + worker for async pipeline" and pushed.

## Phase 16 — Frontend polling for async pipeline runs

**Status: done.** `DashboardStore.runPipeline()` (`frontend/src/app/core/state/dashboard.store.ts`) now branches on the triggered run's `status`:

- If it's not `'started'`, unchanged behavior: `refresh$.next()` + `refreshRuns()` immediately.
- If it *is* `'started'`, a new private `pollRun(runId)` starts `interval(1500).pipe(switchMap(() => this.pipelineService.listRuns()), filter(...), take(1), takeUntilDestroyed(this.destroyRef))`; once the matching run's status is no longer `'started'`, the subscription sets `this.runs` directly from that poll response (skipping a redundant `refreshRuns()` call) and fires `refresh$.next()` so the drone markers refresh too.
- Reuses the existing `GET /api/pipeline/runs` list endpoint - no new backend endpoint needed, matching the "no `GET /api/pipeline/runs/{id}`" decision from Phase 5.
- `pipeline-panel.component.html`/`.css` already bind `[runs]`/`.badge.started` from Phase 10 and the dashboard component already passes `store.runs()`/`store.triggering()` through - no template changes needed.
- Added `frontend/src/app/core/state/dashboard.store.spec.ts` (new file - the store was previously only exercised indirectly): `vi.useFakeTimers()` + `vi.advanceTimersByTime(...)` (same pattern as `app.spec.ts`), one test asserting the sync case refreshes immediately with no poll requests, one test asserting the `started` case polls twice (still-started, then completed) before refreshing exactly once and updating `runs` from the poll response.
- `ng test --watch=false`: all 6 spec files / 18 tests green (2 new).

## Phase 17 — Verify both demo modes end-to-end

**Status: done.**

- **Bug found and fixed while writing the Prefect-overlay Playwright walkthrough**: Phase 16's `runPipeline()` only wrote to `this.runs` once the poll saw a non-`started` status - so the runs table never actually showed the `started` badge, it just jumped straight to `completed` once the poll resolved (same end result as the sync path, defeating the point of showing async progress). Fixed by having the success handler on `pipelineService.run()` immediately upsert the returned `started` run into `this.runs` (dedup by `id`) before `pollRun()` starts, so the amber "started" badge appears the instant the trigger POST resolves. Updated `dashboard.store.spec.ts` to assert this optimistic-insert state explicitly; `ng test --watch=false` still green (6 files / 18 tests).
- Rebuilt the `web` image (`docker compose -f docker-compose.yml -f docker-compose.prefect.yml up --build -d`) so the container actually ran the Phase 16 code, then drove it with a Playwright script (chromium, headless): click "Run Pipeline" -> button shows "Running…" during the POST -> new row appears with `.badge.started` immediately -> `.badge.completed` appears ~9s later via the poll -> URL unchanged throughout (no reload) -> `.leaflet-interactive` marker paths present on the map. All assertions passed.
- Took the overlay down (`docker compose -f docker-compose.yml -f docker-compose.prefect.yml down`), brought up the plain stack (`docker compose up --build -d`, same named Postgres volume), and re-ran a plain-mode walkthrough: click "Run Pipeline" -> `.badge.completed` appears in <100ms (no poll wait), button resets to "Run Pipeline", no navigation, markers present. Confirms Phase 16 added zero latency/regressions to the sync path.
- Updated README's "Async pipeline execution (Prefect, bonus)" section with a paragraph describing the started-badge-then-completed UI behavior and that the sync path skips it entirely.
- Final cleanup done: Prefect overlay containers stopped/removed; only the plain stack (`db`/`api`/`web`) is left running for you.
- Commits: "Phase 16: Frontend polling for async pipeline runs" (`500eedf`, already pushed) + a Phase 17 commit for the optimistic-insert fix, README update, and this status - pushed per your standing instruction to commit+push after each phase.

## Final submission-readiness audit

Ran after all 17 phases were marked done, at your request for "a final look at the whole repo for submission readiness." Checked git hygiene (`git status`/`git clean -ndx`/`git ls-files` for tracked secrets, `.db`, `node_modules`, `__pycache__`), re-ran both test suites, and dispatched two independent code-review passes (backend, frontend) cross-checked against `claude.md`'s stated conventions and this file's own claims.

Findings and fixes:
- **Backend**: `GET /api/stats` had no `response_model` - the one endpoint returning a bare `dict` where every other route is typed, contradicting `claude.md`'s "All endpoints typed with response_model." Added `app/schemas/stats.py` (`StatsRead`), wired it into the route, and added `tests/test_stats_api.py` (seeded + empty-db cases) - this endpoint previously had no tests at all. Backend suite now 42 tests green.
- **Frontend**: `DashboardStore.selectDrone()` was the one API call with no `error` handler, contradicting `claude.md`'s "loading + error state on every API call" - a failed history fetch would silently leave the path panel empty with no feedback. Added an `error: (err) => this.error.set(err.message)` handler matching the pattern used elsewhere in the store. Frontend suite still 18 tests green (behavior change, no new test needed - existing coverage doesn't exercise the failure path and adding one would just restate the fix).
- Stale doc found and fixed: README's Testing section still said "16 tests" for the frontend suite (pre-Phase 16); corrected to 18, and the backend line bumped 40 → 42 for the stats tests just added.
- Nothing else found: no `TODO`/`FIXME`/`console.log`/stray `print()`/bare `except:`/commented-out code in tracked source; no secrets or real credentials in `.env.example` or compose files (only the local dev placeholder `drone:drone`); on-disk directory layout matches the README's documented Architecture/Project-structure trees exactly; Alembic `downgrade()` is real and matches current models; global exception handler doesn't leak tracebacks.
- Minor/optional items surfaced but deliberately not acted on (logged here so they're not lost, not because they're required): the Alembic migration file still carries Alembic's autogenerated "please adjust!" comments (cosmetic only - reviewed and correct); rapid double-clicks of "Run Pipeline" during an in-flight async run start a second independent poll loop rather than being deduped (harmless duplicate polling traffic, not a leak); `pipeline_run.error_message` stores the raw `str(exc)` unsanitized (low risk given the exceptions actually reachable there); `app/pipeline/loaders.py` has no dedicated unit test file (covered indirectly via pipeline integration tests).

Committed as a submission-readiness follow-up commit, pushed.

## Phase 18 — Fix "latest position per drone" computing the dedupe client-side instead of in the backend

A bug report on the "Show latest position per drone only" toggle (added in Phase 9) turned out to be accurate: `GET /api/drones` only ever returns the N globally most-recent rows (`ORDER BY timestamp DESC LIMIT/OFFSET`, default N=50) with no grouping by `drone_id`. `DashboardStore`'s `latestOnly` toggle only deduped whatever page had already been fetched, client-side, and never re-fetched when flipped. If one drone transmitted far more frequently than the others, its rows could fill the entire page, so other drones' rows - sitting at offset 51+ - never reached the browser at all; no amount of client-side dedup could recover them.

- **Backend**: extracted the repeated filter-`.where()` block in `app/services/drones.py` into `_apply_drone_filters()`, then added `query_latest_drones()` using a `ROW_NUMBER() OVER (PARTITION BY drone_id ORDER BY timestamp DESC)` window function - portable to both SQLite (used by the test suite) and Postgres, unlike Postgres-only `DISTINCT ON`. Filters (including `from`/`to`) apply before ranking, so a drone with no rows left in the filtered set simply doesn't appear. Exposed as a new `GET /api/drones/latest` endpoint (same `Page[DroneRecordRead]` shape as `/api/drones`), added *before* the `/{drone_record_id}` route so it isn't swallowed by the int-typed path param. `GET /api/drones` itself is unchanged - `DroneService.history()` (path-history bonus, Phase 9) still needs its literal raw-row behavior.
- **Backend tests**: new `tests/test_drones_service.py` (5 tests) seeding a flooding drone directly against the `db` fixture, asserting `query_drones` still misses other drones (documents the known, intentional raw-log behavior) while `query_latest_drones` returns every distinct drone, paginates over distinct drones (not rows), and filters-before-ranks correctly. New fixture `data/incoming/sample_drones_flood.json` (one drone with 3 records newer than two single-record drones) plus 3 new `tests/test_drones_api.py` cases exercising the same scenario through the real HTTP endpoints, including a route-collision regression check for `/latest` vs `/{id}`.
- **Frontend**: `DroneService.listLatest()` added (shares the existing param-building logic with `list()` via a new private `buildParams()`). `DashboardStore`'s `refresh$` pipeline now branches on `latestOnly()` between `list()`/`listLatest()`; `toggleLatestOnly()` resets `offset` to `0` and calls `refresh$.next()` instead of just flipping a signal, since `total` means something different in each mode (distinct drones vs. raw rows) and a previously-valid offset could be out of range after the switch. Deleted the now-dead `dedupeLatestPerDrone()` helper and the `visibleItems` computed signal - `items()` is always correct for the current mode, so `dashboard.component.html`'s two `visibleItems()` usages became `items()`.
- **Frontend tests**: `drone.service.spec.ts` gained `listLatest()` param-forwarding tests mirroring `list()`'s. `dashboard.store.spec.ts` and `app.spec.ts` updated - `latestOnly` defaults `true`, so every existing auto-triggered refresh now expects `/api/drones/latest` instead of `/api/drones` - plus two new tests: toggling refetches from the other endpoint, and toggling resets `offset` before refetching.

**Status: done.** Backend `pytest`: 52 tests green (10 new). Frontend `ng test`: 23 tests green (6 new). Committed as `6daf82d` ("fix: compute latest-per-drone position in the backend, not the frontend") - not yet pushed.

## Phase 19 — Fix race condition on concurrent pipeline runs for the same source

A bug report described two clients clicking "Run Pipeline" for the same source at the same time. Confirmed real: `_dedupe_against_existing()` in `app/pipeline/run.py` did a `SELECT` of existing `(drone_id, timestamp)` keys, filtered the new batch against that snapshot in Python, then inserted - a classic check-then-act race. Two concurrent runs can both see "nothing exists yet," both try to insert the same rows, and the second one's commit hits `UniqueConstraint("drone_id", "timestamp", "source")` and raises `IntegrityError`, which propagates past the broad `except Exception` in `execute_pipeline_run` (which correctly marks the run `FAILED` first) all the way to the generic 500 handler in `main.py`. Not a data-corruption bug (the constraint prevents duplicate rows either way) but a real reliability/UX bug - the loser of the race gets an ugly 500 and a `FAILED` run row instead of succeeding or no-op'ing.

- **Fix**: replaced the check-then-insert pattern with a single atomic database upsert (`INSERT ... ON CONFLICT (drone_id, timestamp, source) DO NOTHING`), pushing the "does this already exist" decision into the database where it can be made atomically. Chose this over a Redis-based distributed lock since it needs no new infrastructure/dependency and the project has none today.
- `app/pipeline/run.py`: removed the `SELECT existing_keys` step; `_dedupe_against_existing()` renamed to `_insert_new_records()`, builds dialect-aware `insert()` (`sqlalchemy.dialects.postgresql.insert` vs `sqlalchemy.dialects.sqlite.insert`, selected via `db.get_bind().dialect.name`, since prod runs Postgres but tests run SQLite) with `.on_conflict_do_nothing(index_elements=["drone_id", "timestamp", "source"])`, executed via `db.execute(stmt)`. Kept the in-batch `seen_in_batch` dedup (avoids feeding the same key twice within one INSERT).
- **Tests**: added `test_concurrent_pipeline_runs_do_not_crash_on_duplicate_insert` in `tests/test_pipeline.py` - opens two separate `Session`s against the same engine, computes the same insert batch independently (no shared "existing rows" snapshot, mirroring the race), commits one then the other, and asserts the second commit does not raise `IntegrityError` and no duplicate rows land in `drone_record`. Existing `test_rerunning_same_source_is_idempotent` continues to pass unchanged.

**Status: done.** Backend `pytest`: 53 tests green (1 new). No frontend changes needed - this was a backend-only atomicity fix.

## Phase 20 — Filter chip popover extraction + "night-ops console" visual identity

The filter toolbar was mid-refactor going into this phase (uncommitted): each filter (drone type, status, operator, min battery, date range) had been pulled out of one flat `filter-panel` template into a shared `app-filter-chip` component - a pill trigger that toggles an absolutely-positioned popover (click-outside/Escape to close, `aria-expanded`/`role="dialog"`), so `filter-panel.component.ts` now just holds the draft/apply state per filter and each chip's content is projected via `<ng-content>`.

On top of that, a deliberate visual redesign (via the `frontend-design` skill, user chose the bolder of two proposed directions): the whole dashboard shell was reading as generic light SaaS-admin (white chrome, gray hairlines, one default blue `#2563eb` for everything, pill chips, system-ui font) despite the actual subject being a live signal-monitoring console (active/landed/lost_signal/low_battery states, coordinates, timestamps - radar/avionics vocabulary, not spreadsheet vocabulary).

- **Tokens** (`styles.css`): new dark console tokens - `--console-ink #0A0E13` (page bg), `--console-panel #12181F` (header/toolbar/sidebar/popover surfaces), `--console-line #232B34` (hairlines), `--console-text #DCE4EA`, `--console-text-dim #7A8896`, `--console-accent #4FD1C5` (UI-chrome-only teal for focus/active states). The existing `--status-*` semantic vars (`active`/`landed`/`lost_signal`/`low_battery`) are untouched - they're shared truth with `status-colors.ts`/map markers/pipeline badges, and now read as actual indicator lights against dark chrome instead of pastel badges on white.
- **Type**: added IBM Plex Sans Condensed (labels/buttons/headers) + IBM Plex Mono (anything numeric - battery %, timestamps, drone IDs, pagination counts) via a Google Fonts `<link>` in `index.html`. Noting per `claude.md`'s "don't add libraries without noting why": this is a font load, not a runtime dependency, chosen because a technical condensed+mono pairing reads as an instrument-panel readout rather than a generic sans doing every job.
- **Dashboard shell** (`dashboard.component.css/html`): header/filters-toolbar/sidebar recolored to `--console-panel` on `--console-ink`; pagination count and selection-panel drone-id rendered in the mono face (tabular figures); loading overlay restyled to match.
- **Filter chip signature** (`filter-chip.component.*`): square-ish corners (not pills) to match instrument-panel language, label in condensed caps, value slot in mono; active state renders a teal underline that only glows (`box-shadow`) when that filter is actually applied - one recurring motif encoding real armed/idle state rather than decoration.
- **Filter panel / reset button**: control-strip layout kept (flex-wrap row), reset button restyled to match the dark chrome + teal focus ring.
- **Knock-on contrast fixes**: `pipeline-panel.component.css` (table text/borders/empty-state/button) updated for readability against the now-dark sidebar - it inherited default light-mode colors and would've been unreadable otherwise. `map.component.ts`'s hardcoded path-line color (`#2563eb`) swapped to `--console-accent` for consistency with the new accent.
- Explicitly out of scope: map marker colors and pipeline badge colors, since those are the shared `--status-*` semantic truth, not chrome.

**Status: done.** `ng test --watch=false`: 7 spec files / 34 tests green, no changes needed (styling-only, no DOM structure/selector changes). Verified visually with `ng serve` against the already-running `api` container (proxying `/api` to `localhost:8000`): dark chrome renders correctly, `STATUS: ACTIVE` chip shows the teal glow underline and re-filters the map/pagination as expected, map markers/pipeline badges (green/amber/red/gray `--status-*`) read clearly against the dark sidebar, mono-face readouts (pagination count, run timestamps, badges) render as intended. `pipeline-panel.component.css`'s `.badge.failed` was also switched from a hardcoded `#991b1b` to the existing `var(--status-lost-signal)` token while touching that file (same color family, just de-duplicated - not a semantic change).

## Phase 21 — Fix race condition where clicking a drone could draw a different drone's path

While manually testing the path-history feature against a new local-only fixture (three drones each with a real multi-point route, not committed to this history), clicking between drone markers in quick succession showed a route that belonged to a *different* drone than the one just clicked.

Root cause: `DashboardStore.selectDrone()` (`dashboard.store.ts`) called `this.droneService.history(droneId).subscribe(...)` directly on every click, with no cancellation of a request still in flight from a previous click. Two drones' `GET /api/drones?drone_id=...` requests could be in flight concurrently, and whichever resolved *last* won and overwrote `pathPoints`, regardless of which drone was actually selected - since different drones have different history sizes and thus different response times, this reordered in a way that reproduced consistently rather than as a rare fluke. `selectDrone()` was added in Phase 9 and, unlike `refresh$` and `pollTrigger$` in the same file (the latter itself a fix for the identical class of bug - Phase "cancel prior pipeline poll loop"), never got a `switchMap` guard. It also had zero test coverage (`dashboard.store.spec.ts` had no `selectDrone`/`pathPoints`/`clearSelection` tests at all), which is why this went unnoticed.

- **Fix**: added a `selectDrone$: Subject<string | null>` piped through `switchMap` (mirroring the existing `refresh$`/`pollTrigger$` pattern in the same constructor) so selecting a new drone - or calling `clearSelection()` - cancels any still-pending history request before it can resolve. `selectDrone()`/`clearSelection()` now just push into that subject instead of subscribing per-call.
- **Tests** (`dashboard.store.spec.ts`, +3): `selectDrone()` happy path (fetch + sort by timestamp ascending); a direct regression test that selects two drones back-to-back and confirms the first drone's request comes back `cancelled` from Angular's HTTP client, and only the second drone's response lands in `pathPoints`; `clearSelection()` cancels a pending request and resets `pathPoints`.

**Status: done.** `ng test --watch=false`: 7 spec files / 37 tests green (3 new, nothing else regressed). Verified against the already-running `api` container: re-selecting drones in quick succession (`DRONE-101`/`DRONE-102`/`DRONE-103`, seeded locally for this test) now always draws the path for whichever drone was clicked last.

## Verification

- Backend: `pytest` (all of Phase 6 + stats tests from the final audit + Phase 18's `query_latest_drones` coverage + Phase 19's concurrency test) green; manually hit `POST /api/pipeline/run` against both sample files and confirm `pipeline_run` counters match the known valid/invalid split; hit `/docs` and exercise each `/api/drones` and `/api/drones/latest` filter combination and the `/api/drones/{id}` 404 case.
- Frontend: `ng test` (Phase 11 + Phase 16's store spec + Phase 18's listLatest/toggle coverage + Phase 21's selectDrone race-condition coverage) green - 37 tests; manually run `ng serve`, trigger the pipeline from the UI, confirm markers appear/update, filters refetch and reset pagination, low-battery/lost-signal styling and path-history polyline render correctly on the sample data, toggling "Show latest position per drone only" shows every active drone even when one is transmitting far more frequently than the others, and clicking between drones always draws the just-clicked drone's path.
- End-to-end: `docker compose up --build` from a clean checkout, confirm frontend (`:4200`) and API (`:8000/docs`) both come up healthy and the full flow (run pipeline → see markers → filter → click drone → see path) works without manual intervention.
