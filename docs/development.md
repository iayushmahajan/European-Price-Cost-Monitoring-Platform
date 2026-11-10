# Development and operations

Run the commands below from the repository root unless a different directory is
shown. Docker Engine with Compose is required. On Windows, Docker Desktop needs
WSL integration enabled. The [README](../README.md#run-locally-with-docker)
contains the fresh-clone steps.

For a new installation, copy `.env.example` to `.env` and set three distinct,
URL-safe database passwords. For an existing installation, keep the credentials
that match its database volume. Replacing `.env` with sample credentials does not
change passwords in an initialized database. Keep credentials and backups out of Git.

## Docker application on port 5173

```sh
docker compose up -d --build
```

Open **http://localhost:5173/**. The application routes are `/app/overview`,
`/app/explore`, `/app/analyst` and `/app/sources`. Original retail routes remain
available at `/overview`, `/explore`, `/analyst` and `/data`, with their data and
history preserved. If a tab still shows an older bundle after an update, hard-refresh it.

Nginx serves the frontend on port 5173. It strips `/api/` from browser requests
and forwards them to `backend:8000`; the backend connects to PostgreSQL at
`db:5432`. Neither backend nor database ports need to be exposed on the host.

Compose runs the migration service before starting the backend. The current
migration head is `0008`. Back up an existing database before an upgrade and
never reset migration history to resolve an image or connection mismatch.
`docker compose up -d --build` rebuilds application images; `docker compose restart`
only restarts the images already in use. If changing environment values without
a code rebuild, recreate the affected service to load them.

```sh
# Inspect service state, recent logs and API health.
docker compose ps
docker compose logs --tail=80 backend frontend
curl http://localhost:5173/api/health
curl http://localhost:5173/api/v1/price-cost/sources

# Stop/start without deleting containers or persistent volumes.
docker compose --profile price-cost-sync stop
docker compose up -d
```

Do not use `down -v`, `docker volume rm` or database reset commands to repair a
startup problem. If Compose warns that an existing PostgreSQL volume was created
outside Compose, inspect its identity and contents before changing anything.
Deleting it to suppress the warning would also delete its data.

## Synchronization

A fresh database has no price-cost observations until ingestion succeeds. For an
initial import bounded to January 2025 onward:

```sh
docker compose --profile price-cost-sync build price-cost-sync
docker compose --profile price-cost-sync run --rm --no-deps price-cost-sync \
  python -m app.scripts.sync_price_cost sync --mode backfill --since 2025-01-01
```

The worker stores original responses in the `price_cost_raw` volume. Importing
a bounded period does not mean the full source archives are present.

### Manual commands

From the repository root, with `.env` configured and the existing DB available:

```sh
docker compose --profile price-cost-sync build price-cost-sync
docker compose --profile price-cost-sync run --rm price-cost-sync \
  python -m app.scripts.sync_price_cost sync --mode backfill
docker compose --profile price-cost-sync run --rm price-cost-sync \
  python -m app.scripts.sync_price_cost sync
docker compose --profile price-cost-sync run --rm price-cost-sync \
  python -m app.scripts.sync_price_cost sync --source eurostat_prc_hicp_minr \
  --mode backfill --since 2020-01-01
docker compose --profile price-cost-sync run --rm --no-deps price-cost-sync \
  python -m app.scripts.sync_price_cost status
```

Other source identifiers: `ec_weekly_oil_bulletin`, `ecb_exr`; default `--source all`.
`status` performs only SELECTs and returns persisted run state, live observation
freshness, successful source-update time, attempt/success times, per-series first/last
periods and last retrieval evidence. `--no-deps` avoids starting migrations during
read-only inspection. Exit codes: 0 successful, 1 any selected source failed/busy,
130 interrupted. All-source manual checks continue to later sources after an error.

For local Python, run the same module from `backend/` using the existing virtual
environment, app-role DATABASE_URL and a writable `PRICE_COST_ARTIFACT_ROOT`.
The default root `/var/lib/price-cost` is prepared for the non-root Docker user.

Optional `--oil-history /path/manifest.json` can additionally import archived
**official weekly-format** workbooks. Each JSON entry contains `url`, `tax_basis`
(`with_tax`/`without_tax`) and optional `publication_date` (`YYYY-MM-DD`). Only EC
HTTPS document download XLSX URLs are accepted; their actual workbook reference
week determines the observation period. Conflicting duplicate facts in one staged
run abort publication. Routine backfills use automatic archive discovery.

### Scheduler configuration

```sh
docker compose --profile price-cost-sync up -d price-cost-sync
docker compose logs --tail=100 price-cost-sync
```

The opt-in worker uses the existing backend image, migrations dependency and
application role. It restarts independently of FastAPI and waits 60 seconds between
due-time checks. An interrupted `running` run is eligible immediately after restart;
PostgreSQL locking handles multiple workers. A failed source retries within an hour,
without blocking other sources permanently. Success and backfill due-times persist
in PostgreSQL across container restarts. It checks ECB every six hours, including
nonpublication days; those checks can successfully report no change.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SYNC_FUEL_INTERVAL_SECONDS` | 604800 | Weekly fuel check |
| `SYNC_HICP_INTERVAL_SECONDS` | 86400 | Daily checks covering monthly release and retries |
| `SYNC_ECB_INTERVAL_SECONDS` | 21600 | Six-hour checks covering working-day publication |
| `SYNC_BACKFILL_INTERVAL_DAYS` | 30 | Full historical revision reconciliation |
| `SYNC_OVERLAP_DAYS` | 400 | Incremental revision window (minimum 7) |
| `SYNC_HICP_GEOS` | EU27_2020 + EU-27 countries | Approved geography subset |
| `SYNC_HICP_CATEGORIES` | TOTAL,CP01,CP03,CP04,CP06,CP07,CP11 | Approved category subset |
| `SYNC_HICP_UNITS` | I25,RCH_M,RCH_A | Explicit measurement types |
| `SYNC_ECB_CURRENCIES` | CZK,DKK,HUF,PLN,RON,SEK,GBP,CHF,USD | Seeded quote currencies |

Intervals must be at least 60 seconds; full backfill interval at least one day.
Selections are comma-separated, nonempty, unique and restricted to the existing
source contracts/catalogue. Change `.env` then recreate the worker to apply them.

The [data-source guide](data-sources.md#source-specific-history-and-incremental-checks)
explains full-backfill boundaries, the 400-day incremental overlap and revision
reconciliation. A scheduled full backfill can extend an initially bounded import.
Observation freshness and synchronization health are separate; their
[thresholds and date semantics](data-sources.md#freshness-and-source-dates) are
assessed independently of the scheduler cadence.

## Frontend development on port 4173

Keep Docker running. With Node.js 24 and npm installed, open another terminal:

```sh
cd frontend
npm ci
API_PROXY_TARGET=http://127.0.0.1:5173/api npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

Open **http://localhost:4173/**. This is Vite's development server, using the same
backend and database as the Docker application. Stop it with Ctrl+C.

Vite removes the browser's `/api` prefix before forwarding requests. Including
`/api` in the target above restores the prefix expected by Nginx. The default
Vite target, `http://localhost:8000`, is for a backend running directly on the
host. Port 4173 is a development option, not a second deployment with its own data.

## Tests and live checks

Run backend integration tests only against a separate disposable database. The
Compose test override uses `price_cost_m7_test`; never replace it with the
application database in a reset-enabled test run.

```sh
# Run from the repository root. Create this disposable database once.
docker compose exec -T db createdb -U postgres -O analytics_app price_cost_m7_test
docker compose -f docker-compose.yml -f docker-compose.test.yml build backend-tests
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --no-deps backend-tests

# Read-only live checks; stored official observations are required.
docker compose exec -T backend python - < scripts/validate-price-cost-live.py
docker compose --profile price-cost-sync run --rm --no-deps -T price-cost-sync \
  python - < scripts/verify-price-cost-artifacts.py

cd frontend
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npx playwright install --with-deps chromium
npx playwright test --workers=2
npx playwright test --config playwright.live.config.ts
```

If `price_cost_m7_test` already exists, reuse it. The backend suite intentionally
resets the selected test database. Fixture browser tests start Vite and intercept
API requests; the separate live suite connects to Docker on port 5173 without
interception. It is read-only by default. Set `RUN_LIVE_AI=1` to include a provider
query and saved-result check, which consumes provider allowance and creates history.

Two other scripts have side effects and should be run deliberately:

- `scripts/validate-price-cost-analyst-live.py` submits provider questions and saves
  ordinary analysis-history records.
- `scripts/validate-price-cost-recovery.py` records a controlled failed ECB check
  before attempting recovery. Run it only in a maintenance window with no other
  ingestion writer.

### Local Python and focused checks

The Docker test image installs the development dependencies. If using local Python
3.11 instead, create `backend/.venv` and install `backend/requirements-dev.txt`.
Provision isolated test app/reader roles and set `TEST_DATABASE_URL`,
`TEST_ANALYTICS_DATABASE_URL` and `TEST_ALLOW_RESET=1`. `TEST_ADMIN_DATABASE_URL`
enables the negative administrative-role test; CI supplies all three role URLs.
Never point these reset-enabled URLs at the application database.

From `backend/`, with those test variables exported:

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m pytest -q tests/test_price_cost_api.py tests/test_price_cost_analyst.py
.venv/bin/python -m ruff check .
.venv/bin/python -m compileall -q app tests
DATABASE_URL="$TEST_DATABASE_URL" .venv/bin/python -m alembic check
RUN_LIVE_SOURCE_TESTS=1 .venv/bin/python -m pytest -q tests/test_source_adapters_live.py
```

Optional source smoke tests make network requests. Keep provider and source probes
separate from normal deterministic tests, and use a test deployment if a probe
will write observations or history.

## Validation scope and limits

The backend suite covers PostgreSQL constraints, arithmetic, revisions, rollback,
locking and the existing retail security behavior. Frontend unit and browser tests
use deterministic contract-compatible fixtures for success, clarification and
failure states. The separate live suite uses real API responses. Automated
accessibility scans cover selected responsive/keyboard states; they do not replace
physical-device or screen-reader testing, which remains pending.

Saved successful analyses and API health do not prove current provider quota.
A fresh clone has no stored price-cost observations. Existing source freshness or
synchronization warnings must be inspected rather than hidden. Historical release
counts and milestone acceptance reports remain in Git history; they are not a
substitute for running the checks against a changed environment.

## Raw storage, backup and recovery

The named Docker volume `price_cost_raw` is mounted at `/var/lib/price-cost`:

```text
raw/{source_code}/{sha256}.{xlsx|json|csv|html}
```

PostgreSQL data is stored separately in the `postgres_data` volume.
The worker runs as appuser; the image initializes volume ownership. Only safe
source identifiers/extensions are accepted, resolved paths must stay within the
root, and an existing content/hash mismatch fails instead of overwriting evidence.
No automatic pruning is enabled. Retain every artifact referenced by current
observations **or any revision**, plus its supporting landing-page evidence.
All run metadata is permanent. Failed/unreferenced files may be manually reviewed
for removal after 30 days, only after checking database references and backups.
There is no implemented garbage collector; temporary `.download-*` files after
SIGKILL can be reviewed similarly. Never remove the database volume.

For a consistent backup, stop all ingestion writers and pause application writes,
including Analyst history. The commands below stop the local worker and backend,
then save PostgreSQL and raw files from the same window. Pause any other writers
before running them. Use a private backup directory, not the repository:

```sh
umask 077
docker compose stop backend price-cost-sync
docker compose exec -T db pg_dump -U postgres -d analytics_db -Fc > /private/path/analytics.dump
docker compose --profile price-cost-sync run --rm --no-deps --entrypoint tar \
  price-cost-sync -C /var/lib/price-cost -czf - raw > /private/path/price-cost-raw.tgz
docker compose --profile price-cost-sync up -d backend price-cost-sync
```

Create `/private/path` or substitute an existing private directory before running
the commands. Check that both backups completed before restarting services; the
restart above enables the scheduler, so omit `price-cost-sync` if it was not in use.
Store the pair off-host and test restore into a separate deployment. On restore,
retain relative paths and appuser ownership and verify SHA-256 against
`source_artifacts` before serving evidence. Restore both components from the same
backup generation. A database-only restore is insufficient for artifact evidence.

### Restore into a separate database

Verify a database archive and test it in a **new** recovery database. The following
assumes the backup is at `/private/path/analytics.dump` and the application's
roles already exist in the PostgreSQL instance:

```sh
docker compose exec -T db pg_restore -l < /private/path/analytics.dump
docker compose exec -T db createdb -U postgres -O analytics_app recovery_review
docker compose exec -T db pg_restore -U postgres -d recovery_review --exit-on-error < /private/path/analytics.dump
```

Use a new recovery database name if `recovery_review` already exists. Restore the
matching raw archive into a separate recovery location, preserving relative paths
and `appuser` ownership. Check restored row counts, migration state and artifact
hashes before switching any application connection. Never overwrite the original
database or artifact volume as a restore shortcut.

A readable archive listing and matching checksums establish that files can be
read, not that recovery will succeed. Test a full restore of the database/raw pair
in an isolated location before relying on it, and retain private off-host copies.

## Troubleshooting and limits

Inspect `status`, worker logs and the latest `ingestion_runs` /
`data_quality_events` by source/run. Errors intentionally omit payloads and secret
connection details. For upstream/schema failures, keep serving the previous dataset,
repair/verify the parser contract and rerun. For disk corruption, restore the raw
artifact from backup; the importer refuses a conflicting existing file. For locks,
inspect the active worker/PostgreSQL session before stopping a known worker; do not
force-delete run history. After a killed worker, the next due/manual run repairs its
audit state under the source lock. Database lock/write timeouts follow existing
PostgreSQL configuration; network bounds do not imply an entire-source deadline.

Staging uses process memory, so full backfill work scales with
historical records. Requests are batched per HICP geography/ECB currency, with no
queue or distributed task system. The archive contract intentionally fails on
unexpected upstream layouts. Monitoring/alert delivery and a native withdrawal
model remain future work. Scheduling is provided but opt-in; deployment must
activate it. Typed read APIs use these facts, revisions and freshness states
without granting AI SQL access or weakening these provenance boundaries.
