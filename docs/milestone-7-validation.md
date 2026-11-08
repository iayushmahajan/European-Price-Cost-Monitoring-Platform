# Milestone 7 — live deployment and validation

## 7.1 Runtime diagnosis

Starting HEAD: `20e0bfa`, branch `feature/price-cost-monitoring`. The only pre-existing untracked work was `design-exploration/`; preserved.

| Component | Observed before alignment |
| --- | --- |
| Port 5173 | Docker nginx serving the older retail frontend; `/api/` strips prefix and proxies to Docker backend:8000 |
| Port 4173 | New Vite frontend, temporary review config forwarding `/api` to port 5173 |
| Backend | Production image `d7865899e3db`, uvicorn, no bind mounts, only seven retail routes and migrations 0001–0007 in image |
| Database | `analytics_db`, PostgreSQL 16, Alembic `0007`, volume `european-retail-intelligence-platform_postgres_data` |
| Repository | New frontend, M4/M5 routes and compatible migration 0008 already implemented |

Cause: stale Docker build artifacts, not missing repository route registration. The temporary Vite instance communicated with the old image correctly but therefore received 404 for the new catalogue. No backend is published on host port 8000. Database roles analytics_app/analytics_reader are nonsuperuser/non-createdb.

Before upgrade: 14,955 retail observations, 2 retail imports, 9 history records. Recovery material is private in `.local-backups/` (gitignored). Migration 0008 is additive: new catalogue/provenance/observation/revision tables and seeds; its upgrade does not drop existing retail tables. Recovery must restore to a separate database first, verify counts, and only switch service connection after review; never delete the existing volume.

## 7.2 Safe alignment

Created private custom-format `pg_dump`, SHA-256 manifest and restore listing in `.local-backups/pre-milestone7-0007.*`. Restored the dump with `pg_restore --exit-on-error` into the separate `milestone7_restore_check` database; verified migration 0007 and all three legacy counts above. The original volume was never removed or reset. The recovery-check database is retained.

Rebuilt backend, migrate, frontend and sync images from this checkout. Ran only the existing migration runner (`docker compose run --rm --no-deps migrate`): upgrade 0007→0008 and existing grants. Recreated backend/frontend with `up -d --no-deps`; no database recreation. The canonical application will be the new Docker-served frontend at `http://localhost:5173`, using nginx `/api`→backend:8000. Port 4173 is optional development, not a second product deployment.
