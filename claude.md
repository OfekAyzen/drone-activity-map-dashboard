# Project: Drone Activity Map Dashboard

## Stack
- Backend: FastAPI, SQLAlchemy 2.0, Pydantic v2, PostgreSQL, Alembic, pytest
- Frontend: Angular (standalone components), TypeScript, RxJS, Leaflet
- Infra: Docker Compose (backend, frontend, db)

## Conventions
- Backend layout: app/{api,models,schemas,pipeline,db,core}, tests/ mirrors app/
- Pydantic schemas separate from SQLAlchemy models; never return ORM objects directly.
- All endpoints typed with response_model. Filters via query params.
- Frontend: one service per domain (DroneService, PipelineService), typed interfaces
  matching the API contract, loading + error state on every API call.
- Commit style: conventional commits (feat:, fix:, test:, docs:, chore:).

## Rules for you (Claude)
- Plan before implementing multi-file changes.
- Write or update tests with each feature.
- Don't add libraries without noting why.
- Keep functions small and single-purpose.
- Before each commit make sure to update and add to the phases in the PLAN.md.
- Always make sure to update the phases in the PLAN.md before making any changes to the code.
- After each commit, update the README.md with the changes that were made.