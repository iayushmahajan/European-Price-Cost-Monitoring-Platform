# Run the completed application locally (WSL)

Run from the repository directory. Docker Desktop must be running with WSL integration. Keep the existing `.env` private; it supplies the existing database credentials and provider configuration. Never replace it with sample credentials against the existing volume.

## Canonical workflow — Docker on port 5173

```sh
cd ~/projects/European-Retail-Intelligence-Platform
docker compose up -d --build
```

Open **http://localhost:5173/**. The root now serves the new Price & Cost product. Operational routes are `/app/overview`, `/app/explore`, `/app/analyst`, `/app/sources`. Original retail routes remain `/overview`, `/explore`, `/analyst`, `/data`; their data/history are retained. Hard-refresh a tab that still has an older cached application bundle.

Topology: browser → nginx port 5173 → `/api/` strips its prefix → backend:8000 → PostgreSQL db:5432. Backend and PostgreSQL are internal Compose services; host port 8000 is not required. There is no separate live-data frontend deployment on port 4173.

`up --build` rebuilds repository code and invokes the existing migration runner before starting the backend. Migration 0008 is already applied in this environment; do not reset migration history. Back up before any future schema upgrade. A compatible application update can be applied with `docker compose up -d --build`; a plain `docker compose restart` does not rebuild stale images.

```sh
# Inspect health and logs; output contains no configured credentials.
docker compose ps
docker compose logs --tail=80 backend frontend
curl http://localhost:5173/api/health
curl http://localhost:5173/api/v1/price-cost/sources
# Stop/start without deleting containers or persistent volumes.
docker compose --profile price-cost-sync stop
docker compose up -d
```

Do not use `down -v`, `docker volume rm` or database reset commands. A Docker warning that the pre-existing postgres volume was not created by Compose is acknowledged; preserve it, rather than replacing it to suppress the warning.

## Official observations and independent scheduling

The initial bounded backfill begins January 2025. This intentionally does not claim the entire source archives have been imported. The worker stores immutable raw responses in the existing `price_cost_raw` volume, independently of the API.

```sh
docker compose --profile price-cost-sync build price-cost-sync
# One-off read-only status
docker compose --profile price-cost-sync run --rm --no-deps price-cost-sync \
  python -m app.scripts.sync_price_cost status
# Incremental update using the configured 400-day revision overlap
docker compose --profile price-cost-sync run --rm --no-deps price-cost-sync \
  python -m app.scripts.sync_price_cost sync
# Independent automatic worker
docker compose --profile price-cost-sync up -d price-cost-sync
# Stop only that worker
docker compose --profile price-cost-sync stop price-cost-sync
```

The worker checks fuel weekly, HICP daily and ECB every six hours, with bounded retry coverage. Full historical reconciliation defaults to every 30 days; this can extend the initially bounded history on a subsequent scheduled backfill. Configure the documented `SYNC_*` variables in `.env`, then recreate the worker. See [synchronization, retention and backup guidance](price-cost-synchronization.md). No refresh HTTP endpoint is exposed.

## Optional frontend development — port 4173

Keep Docker running as above. In another WSL terminal:

```sh
cd ~/projects/European-Retail-Intelligence-Platform/frontend
npm ci
API_PROXY_TARGET=http://127.0.0.1:5173/api npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

Open http://localhost:4173/. Vite removes the browser `/api` prefix and forwards to the configured target. The `/api` suffix on this Docker-gateway target restores that prefix for nginx. The default target `http://localhost:8000` is only for a separately running host backend. Stop Vite with Ctrl+C. This is hot-reload development, not Vite preview, and uses the same real backend/database.

## Reproduce validation

```sh
# Separate disposable database ONLY. Never set TEST_* URLs to analytics_db.
docker compose exec -T db createdb -U postgres -O analytics_app price_cost_m7_test
docker compose -f docker-compose.yml -f docker-compose.test.yml build backend-tests
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --no-deps backend-tests
# Read-only live contracts/numerical audit (requires populated official observations)
docker compose exec -T backend python - < scripts/validate-price-cost-live.py
# Read-only artifact audit via the raw-volume worker
docker compose --profile price-cost-sync run --rm --no-deps -T price-cost-sync \
  python - < scripts/verify-price-cost-artifacts.py
cd frontend
npm run typecheck
npm test
npm run lint
npm run build
npx playwright test --workers=2
npx playwright test --config playwright.live.config.ts
```

`createdb` is a one-time step; if the explicitly disposable test database already exists, reuse it. The test suite intentionally truncates **only that test database**, not the application. Fixture browser tests start Vite and intercept APIs. The separate live browser suite talks to Docker port 5173 without interception and defaults to read-only checks. Set `RUN_LIVE_AI=1` explicitly to include the provider-query and saved-snapshot test. Provider quotas may affect it. `scripts/validate-price-cost-analyst-live.py` is an additional opt-in provider smoke that creates ordinary analysis-history records. `scripts/validate-price-cost-recovery.py` deliberately records a failed ECB check before real recovery; run only during a controlled maintenance window with no other ingestion writer.

## Backup/recovery

The verified pre-upgrade dump, checksum and table listing are private under `.local-backups/pre-milestone7-0007.*`. A complete restore was tested in the retained separate `milestone7_restore_check` database. These recovery files contain application data; copy them to private off-host storage and do not commit them.

For future consistent backups, stop the worker and pause application writes, then:

```sh
umask 077
docker compose exec -T db pg_dump -U postgres -d analytics_db -Fc > /private/path/analytics.dump
# Verify the archive and restore to a NEW recovery database, never over analytics_db.
docker compose exec -T db pg_restore -l < /private/path/analytics.dump
docker compose exec -T db createdb -U postgres recovery_review
docker compose exec -T db pg_restore -U postgres -d recovery_review --exit-on-error < /private/path/analytics.dump
```

Retain a matching raw-volume archive using the backup command in the synchronization guide. Validate restored row counts, migration state and artifact hashes before considering any recovery connection switch. Never delete or overwrite the original application database as a restore shortcut.

A matching post-upgrade dump/raw pair is also available privately under `.local-backups/post-milestone7-*`, with verified checksums and readable archive listings. This pair was not independently restored; the pre-upgrade dump was fully restore-tested. The independent scheduler was restarted after taking the pair. Copy recovery material off-host according to your backup policy.
