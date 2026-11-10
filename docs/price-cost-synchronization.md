# Official price/cost synchronization — Milestone 3

The existing FastAPI and retail/query interfaces are unchanged. Run ingestion
through `python -m app.scripts.sync_price_cost` or the independent Compose worker.
No refresh HTTP endpoint, API task, or new AI-readable table is introduced.
No migration after `0008` is necessary.

## Publication and failure boundaries

1. Acquire a nonblocking PostgreSQL **session advisory lock per source** using a
   stable SHA-256-derived signed bigint. A second worker exits with a busy error.
   Different sources can use separate workers. The scheduler processes them in turn.
2. Recover abandoned `running` runs under that lock, mark them failed with an
   `INTERRUPTED` event, and durably create the next run and attempt timestamp.
3. Discover/download, strictly parse, validate, and stage batches in memory.
   Three attempts per HTTP request, 60-second socket timeout and attempt deadline,
   exponential delay, bounded numeric `Retry-After` handling, and a 25 MB response
   ceiling prevent unbounded retries/size. A blocking read may extend the attempt
   deadline by up to one socket timeout. Nonretryable HTTP errors fail immediately.
4. Write exact raw responses using temporary files, file/directory fsync and atomic
   replacement; verify existing file hashes. These files become visible before
   database publication. A failed import can therefore leave unreferenced files.
5. In one database transaction, resolve catalogue-backed series, link artifacts,
   compare facts, record revisions, publish changed observations, quality events,
   run counts, source update metadata, coverage, and successful synchronization state.
6. On failure, roll back that transaction, then record a failed run, sanitized
   exception type and `SYNC_FAILED` event in a separate audit transaction. Preserve
   previous observations, revisions, success timestamp and cursor. Disk-full and
   upstream failures cannot replace a successful dataset. A post-commit signal does
   not relabel the already-published transaction as failed.

SIGINT/SIGTERM roll back active work. SIGKILL or host failure releases the PostgreSQL
connection lock; the next worker recovers abandoned runs. If PostgreSQL itself is
unavailable, recording failure is impossible until recovery. A session-level lock
requires direct PostgreSQL connections or session pooling, not PgBouncer transaction
pooling. Only cooperating ingestion writers are protected by this lock.

A run's `fetched_count` is the number of retained HTTP responses, `parsed_count`
is the number of parsed records, `inserted_count` counts new facts, and
`updated_count = revision_count` counts changed facts. `no_change` is a successful
check with no fact changes; its artifacts and retrieval evidence are still recorded.

## Explicit source mapping

| Source | Series identity / catalogue | Current fact and period | Compared/revision attributes |
| --- | --- | --- | --- |
| Oil Bulletin | country + `FUEL_PRODUCT` + tax basis, `FUEL_PRICE`, `EUR_PER_LITRE` | `fuel_price_observations.reference_week` | raw EUR/1,000 litres, exact EUR/litre, status, known weekly publication date |
| HICP | geo + `ECOICOP_2018` + I25/RCH_M/RCH_A | `hicp_observations.reference_month` (first day representing the month) | value and official status; I25 uses base year 2025, rates use PERCENT |
| ECB | `D.{quote}.EUR.SP00.A`, `EXR_SP00`, `FOREIGN_CURRENCY_PER_EUR` | `exchange_rate_observations.reference_date` | rate, status, confidentiality and published precision |

Decimal values exceeding the existing SQL numeric precision/scale are rejected
instead of silently rounded. All provenance links use source-consistent composite
foreign keys. Current facts retain their original provenance on identical checks.
Value/status/precision/publication changes insert typed before/after revisions and
update the current fact together. Identical reimports create no new revision.
Each artifact's URL/hash/size/first retrieval and bounded metadata remain in
`source_artifacts`; each check records `ARTIFACT_RETRIEVED` evidence including its
actual URL, hash, retrieval time and known publication date. HICP dataset update
times are distinct from publication dates and observation months.

## Source-specific history and incremental checks

**Fuel:** discover the two current XLSX links, the history XLSX link and each
component's publication date from the stable official landing page. Retain that
page as a supporting artifact. Missing, ambiguous, external or structurally changed
links fail closed. Require both current tax workbooks to have the same reference
week and EU-27 country coverage. Filenames are never treated as reference dates.

Backfill reads the official price-history workbook from 2005, both tax bases and
both motor fuels. It validates the seven-sheet layout, named country/product
columns, tax-specific headings, units, descending unique dates, and Notes boundary.
The archive includes Greece as GR, mapped to catalogue EL. Missing historical
cells are counted and remain absent. Current EU-27 countries are selected across
history; this does not assert those countries were EU members throughout history.
Aggregates, UK, other fuels, taxes, consumption and exchange-rate columns are excluded.
The latest week comes from the stricter weekly workbooks; archive observations
are imported only before that week, avoiding competing precision representations.
Archive publication describes the file release, not each historical week's release;
unknown historical weekly publication dates stay null. An archive refresh does
not erase a known weekly publication date.

**HICP:** filter `prc_hicp_minr` by configured geography, ECOICOP category and
measurement unit, one geography per request. Full backfill starts January 1996;
actual availability is preserved. Sparse cells produce `SOURCE_MISSING_CELL`
events, never zeros. A previously imported cell subsequently absent from a sparse
response retains its last verified value/provenance; this milestone does not infer
withdrawal/deletion from absence. Inspect missing-cell events when explaining coverage.

**ECB:** filter EXR by configured currencies, one currency per request. Full
backfill starts 4 January 1999; actual series-specific coverage is retained.
Preserve **1 EUR = X quote units**, Decimal values, source precision, status and
confidentiality. Never fill weekends, holidays or absent dates. Missing a whole
requested currency series is a contract failure. This is an informational reference
rate, not a transaction price.

Incremental checks re-fetch the previous **400 calendar days** by default for
HICP, ECB and fuel history, detecting revisions throughout that window. A source
with no successful import, or a changed configuration, automatically backfills.
`--since` sets an explicit inclusive historical boundary; HICP normalizes it to
its containing month. Revisions older than the overlap are detected by periodic
full backfills (default 30 days) or a manual backfill. There is no upstream revision
notification feed or conditional-HTTP optimization. Reimports do not delete facts.
No daily/monthly/weekly synthetic metric is computed.

## Manual commands

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

## Independent scheduling and freshness

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

Freshness dates use Europe/Brussels local calendar days.
Observation freshness uses the **oldest series' latest observation**, rather than
a global maximum that could hide a lagging series. Fuel tolerates 14 days; HICP
65 days from its represented month's first day (a conservative monthly policy,
not a precise release calendar). ECB requires the previous completed TARGET
publication day, excluding weekends, New Year, Good Friday, Easter Monday,
1 May, 25/26 December. Today's release is allowed to be pending. These policies
are in `app.ingestion.freshness`; exceptional closures require an explicit update.
A successful fetch with old observations records `STALE_OBSERVATIONS` and retains
stale state. `status` recalculates freshness as time passes even if the worker stops.
Persisted `status=failed` and observation freshness are separate facts. Per-series
coverage describes series actually present; entirely missing sparse HICP series
must be assessed using missing-cell events/configured scope.

`ingestion_runs.started_at/completed_at` provide execution times. State's
`last_attempt_at` is the attempt start while running/failed and completion on success;
`last_success_at` is successful completion, including no-change checks. This follows
the existing state's timestamp ordering constraint and is distinct from source dates.
No parser infers a cause for a price movement.

## Raw storage, backup and recovery

The named Docker volume `price_cost_raw` is mounted at `/var/lib/price-cost`:

```text
raw/{source_code}/{sha256}.{xlsx|json|csv|html}
```

The existing Compose project name and `postgres_data` volume are unchanged.
The worker runs as appuser; the image initializes volume ownership. Only safe
source identifiers/extensions are accepted, resolved paths must stay within the
root, and an existing content/hash mismatch fails instead of overwriting evidence.
No automatic pruning is enabled. Retain every artifact referenced by current
observations **or any revision**, plus its supporting landing-page evidence.
All run metadata is permanent. Failed/unreferenced files may be manually reviewed
for removal after 30 days, only after checking database references and backups.
There is no implemented garbage collector; temporary `.download-*` files after
SIGKILL can be reviewed similarly. Never remove the database volume.

For a consistent backup, pause all ingestion writers, then save a PostgreSQL dump
and raw-volume archive together before restarting the worker:

```sh
docker compose stop price-cost-sync
docker compose exec -T db pg_dump -U postgres -d analytics_db -Fc > analytics.dump
docker compose --profile price-cost-sync run --rm --no-deps --entrypoint tar \
  price-cost-sync -C /var/lib/price-cost -czf - raw > price-cost-raw.tgz
docker compose --profile price-cost-sync up -d price-cost-sync
```

Store the pair off-host and test restore into a separate deployment. On restore,
retain relative paths and appuser ownership and verify SHA-256 against
`source_artifacts` before serving evidence. Restore both components from the same
backup generation. A database-only restore is insufficient for artifact evidence.

Troubleshooting: inspect `status`, worker logs and latest `ingestion_runs` /
`data_quality_events` by source/run. Errors intentionally omit payloads and secret
connection details. For upstream/schema failures, keep serving the previous dataset,
repair/verify the parser contract and rerun. For disk corruption, restore the raw
artifact from backup; the importer refuses a conflicting existing file. For locks,
inspect the active worker/PostgreSQL session before stopping a known worker; do not
force-delete run history. After a killed worker, the next due/manual run repairs its
audit state under the source lock. Database lock/write timeouts follow existing
PostgreSQL configuration; network bounds do not imply an entire-source deadline.

Operational limits: staging is in process memory and full backfill work scales with
historical records. Requests are batched per HICP geography/ECB currency, with no
queue or distributed task system. The archive contract intentionally fails on
unexpected upstream layouts. Monitoring/alert delivery and a native withdrawal
model remain future work. Scheduling is provided but opt-in; deployment must
activate it. Milestone 4 can build typed read APIs over facts, revisions and freshness
without granting AI access or weakening these provenance boundaries.

## Validation on 8 November 2026

- Full backend suite with disposable PostgreSQL 16 and both app/reader roles:
  **157 passed, 2 skipped** (the opt-in live tests). This includes domain/provenance
  constraints, legacy retail/AI security checks, initial/incremental/idempotent
  imports, revisions, status-only revisions, failure rollback, abandoned-run
  recovery, advisory locking and independent source progress. New ingestion
  integration tests explicitly block network access and use deterministic fixtures.
- Separately enabled official-source smoke tests: **2 passed**. These validate
  existing adapter contracts and the actual discovered/batched acquisition plans.
- Live acquisition -> PostgreSQL publication was also exercised against the
  disposable database, starting 1 October 2026: fuel parsed 540 observations,
  German TOTAL HICP parsed 3, and USD ECB parsed 27. Each identical second import
  reported `no_change`, zero inserts and zero revisions. These are small configured
  live slices, not a full default-scope production performance benchmark.
- The downloaded complete fuel archive parsed 114,831 observations before the
  current week and counted 2,889 absent cells from 2005 onward. Every parsed Decimal
  was checked against the database numeric precision without rounding.
- Ruff, Python compilation, `alembic check` (no new upgrade operations), migration
  head `0008`, Compose configuration validation and production worker image build
  passed. Non-root raw-volume writing/deduplication across containers and the
  image's filtered read-only status CLI passed.
- One existing Starlette/AnyIO deprecation warning remains in the local Python
  test environment. No frontend files, dependencies, query policy or reader grants
  changed. Existing application/database volumes were not removed or migrated by
  these checks. The independent scheduler was not activated against production.

Reproduce deterministic tests from `backend/` with an **isolated disposable**
PostgreSQL database and provisioned app/reader roles:

```sh
TEST_DATABASE_URL=postgresql://analytics_app:TEST_PASSWORD@localhost:TEST_PORT/TEST_DB \
TEST_ANALYTICS_DATABASE_URL=postgresql://analytics_reader:READER_PASSWORD@localhost:TEST_PORT/TEST_DB \
TEST_ALLOW_RESET=1 .venv/bin/python -m pytest -q
.venv/bin/python -m ruff check .
.venv/bin/python -m compileall -q app tests
RUN_LIVE_SOURCE_TESTS=1 .venv/bin/python -m pytest -q tests/test_source_adapters_live.py
```

The integration suite truncates domain/retail tables in its explicitly selected
test database. Never point these reset-enabled tests at the application database.
