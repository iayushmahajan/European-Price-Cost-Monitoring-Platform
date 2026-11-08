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

## 7.3 Official data and API audit

Initial live imports used `sync --mode backfill --since 2025-01-01`, the approved default geographic/category/currency scope, existing parsers and the persistent raw volume. Inserted 10,368 fuel facts, 12,411 HICP facts and 4,257 ECB facts. The same bounded window was then checked incrementally: all three runs reported `no_change`, zero inserts/updates/revisions. No synthetic facts were inserted. Full pre-2025 history is intentionally outside this bounded validation.

All 41 retained raw artifacts matched their database byte lengths and SHA-256 hashes. The source acquisition chain is official landing/API download → existing strict parser → transactional commit → real API. Fuel evidence preserves raw EUR/1,000 L and normalized EUR/L; weekly observation 2026-11-02 and publication 2026-11-05 are separate. The workbook download URL currently contains an older filename date; the importer correctly uses validated workbook reference cells, not that filename.

`scripts/validate-price-cost-live.py`, run in the deployed backend, passed 29 HTTP/schema/numerical checks through **nginx**, not directly against in-process route fixtures. Nine representative observations across products/tax bases, HICP annual/monthly/index and ECB pairs were checked against exact evidence values. Checked sorted real history, backend changes, index base 2025, percentage-point rate differences, 18-place ECB reciprocal, weekday observations, common-period comparisons, empty historical scope and invalid-country/unit/range/index-comparison/evidence errors. The script uses the same Europe/Brussels date policy as the application.

Real published revision changes were not detected in the repeated window. Revision insertion/status-only changes, rollback, locking, provenance constraints and read-only/least-privilege protections passed deterministic PostgreSQL tests in **price_cost_m7_test**, never the application database. A live controlled pre-download ECB failure created a normal failed audit run, preserved every existing fact/revision fingerprint and last successful sync, then a real official incremental recovery returned `no_change/current`. An initial drill attempt used an invalid trigger label and was correctly rejected by the database before publication; the drill now uses `manual`.

The independent scheduler is enabled after these checks, with existing weekly/daily/six-hour frequencies and persisted due times. It was not forced to wait through a complete future schedule interval; scheduling due-time/retry logic is covered by deterministic tests. Its first due-time pass does not trigger another full import because all sources just succeeded.

## 7.4 AI provider

Configured provider/model: Groq / `openai/gpt-oss-20b`; keys/URLs are not reproduced here. Live fuel query returned HTTP 200/success with backend-calculated €2.282/L for Germany, week 2026-11-02, including taxes, and a -0.016 EUR/L previous-week movement. Two current/baseline evidence records were captured. Saved-snapshot restoration matched the exact verified data and assessment date.

Forecasting was blocked locally with a clear unsupported explanation and no numerical prediction. Subsequent inflation, currency and clarification smoke requests returned **HTTP 429** from the provider path. A later browser submission succeeded for ECB after quota allowed it: 1 EUR = 0.83415 GBP for 2026-11-06, with current/baseline evidence. Successful live HICP intent planning and a full provider-backed clarification continuation remain unverified. All typed operations, clarification payload/history, provider timeout/rate-limit handling and security semantics passed deterministic tests. Do not equate the health endpoint's provider `ok` with remaining quota or successful analysis.

## 7.5 Focused functional corrections

- Overview now normalizes its trend category to TOTAL, matching the actual overview API's all-items headline, even when a bookmark carries Explore-specific category parameters.
- Overview identifies supporting observations by source **and** observation ID, avoiding collisions between independently numbered domain tables. React keys use the same compound identity.
- Vite's existing proxy accepts an optional server-side `API_PROXY_TARGET`, allowing hot reload against the Docker gateway without temporary configs or new exposed backend ports.

Added regression tests for both Overview defects and separate opt-in, non-intercepted live browser acceptance. No backend business logic, database model, migration, dependency or design-system change was needed. Initial live browser acceptance selectors were corrected to await URL-controlled checkbox state and use actual saved-analysis wording; these were test assumptions, not contract changes.

The live populated Analyst also exposed a genuine accessibility defect: its wide multi-column result table contained no keyboard-focusable content. All product table scroll regions now have names, region semantics, tab stops and visible focus; the live mobile test verifies ArrowRight scrolls the result. Fixture/live suites also now use separate Playwright output directories, avoiding trace-file cleanup races when run together. No aesthetic redesign was undertaken.

## Data coverage and freshness findings

| Domain | Stored observations | First period | Latest period |
| --- | ---: | --- | --- |
| Fuel | 10,368 | 2025-01-06 | 2026-11-02 |
| HICP | 12,411 | 2025-01-01 | 2026-10-01 |
| ECB | 4,257 | 2025-01-02 | 2026-11-06 |

Fuel and ECB source freshness assess current. HICP's global latest month is October, but its oldest series' latest month is September. The conservative 65-day policy therefore marks **source-wide HICP freshness stale**, despite a successful fresh synchronization and zero consecutive failures. The UI correctly retains that warning; an individual October metric can still be current. No status was manually changed to make the interface appear healthy.

Exact row-content fingerprints against the restored pre-upgrade backup confirmed all 14,955 original retail observations, both imports and all nine original history records remain unchanged. Additional governed smoke queries legitimately create new history records; tests do not replace or relabel legacy records.


The Sources UI now maps an evidenced `current` or `stale` synchronization state with a last-success timestamp to **Succeeded**, while observation freshness independently remains `current/stale`. This fixes misleading duplicate “stale” health labels without changing backend freshness policy. Failed/never-run states are retained, and regression tests cover both success-with-stale-observations and failure-with-current-observations. Expanded source-coverage tables also support keyboard scrolling.

## 7.6 Final acceptance

| Check | Executed command / result |
| --- | --- |
| Complete backend unit/API/PostgreSQL suite | `docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm --no-deps backend-tests` — **270 passed, 2 skipped** (opt-in source smoke tests); one existing Starlette/AnyIO deprecation warning |
| Backend Ruff/compilation | From backend: `.venv/bin/python -m ruff check .`, `.venv/bin/python -m compileall -q app tests` — passed |
| Operational scripts | `backend/.venv/bin/python -m ruff check --config backend/pyproject.toml scripts`, `... -m compileall -q scripts` — passed |
| Frontend type/unit/lint/build | From frontend: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` — passed; **42 tests in 9 files** |
| Fixture browser suite | `npx playwright test --workers=2` — **13 passed**, including original retail regression workflows |
| Real Docker browser suite | `npx playwright test --config playwright.live.config.ts` — **5 passed**, no intercepted responses or fixtures |
| Automated accessibility | 23 live WCAG A/AA axe scans (five pages × four widths plus restored result × three widths), zero violations; 16 product fixture scans also passed |
| Responsive/browser interactions | 320/390/768/1440px, no page overflow, visible units, direct routes, country and domain switching, Back/Forward, product/tax/category/rate/index, common-period comparison, inverse quote, tables, evidence focus, mobile navigation and keyboard table scroll |
| Schema | Live `alembic check`: no new upgrade operations; live DB revision 0008, 25 public tables; integration suite additionally checks upgrade/downgrade and constraints in its disposable database |
| Compose and whitespace | `docker compose config --quiet`, combined test Compose config, `git diff --check` — passed |
| Live acquisition/persistence | Three successful bounded backfills, three identical incremental no-change runs, 41 artifact hashes, successful controlled failure/recovery drill |

The first local backend test invocation used the repository root and failed collection because `app` was not on its import path; rerunning from backend passed, and the complete Docker test suite passed independently. An explicit root-level Ruff configuration override also changed first-party import discovery; using the backend's own directory/configuration passed without unrelated source edits. A frontend check accidentally invoked at repository root found no package.json; rerunning from frontend passed. Script field-name/trigger assumptions were corrected to actual contracts before successful final audits. Shared Playwright trace-output collisions were eliminated by a separate ignored live output directory. These failures are not concealed as passing runs.

[Live screenshots and machine-readable audit results](screenshots/milestone-7/README.md) are separate from the preserved, labelled fixture captures. The Analyst screenshots restore genuine fuel/ECB successful provider snapshots and display their saved assessment dates. A restored result's network log has zero new `/analyst/query` requests; follow-ups populate the composer without automatically querying.

See [exact WSL launch/stop/development/recovery instructions](price-cost-local-running.md). The intended application is now Docker port **5173**, not an obsolete retail build. Port 4173 is optional Vite development only and its documented proxy was verified against the real catalogue. All original data and the design-exploration directory remain preserved. No push, volume deletion, migration rewrite, dependency update or broad redesign occurred.

### Limits and deferred review

- Live HICP AI planning and a full clarification continuation remain quota-limited (429 observed); deterministic tests cover those operations. Fuel and ECB provider-backed success and snapshot restoration are live verified. Provider quota can change after validation.
- The live successful history path and real provider rate-limit path are exercised; provider timeout, malformed output, unavailable sources, request races, unsupported snapshot versions and estimated/provisional/status-only revision cases are predominantly fixture/integration verified. No artificial facts were written into the application database for them.
- Source-wide HICP stale status is a real conservative policy result, not an unresolved synchronization failure. Initial history is bounded from 2025; future configured full backfills may extend it.
- Future scheduler timing has not been observed over a full weekly/monthly cycle. The service is running; due-time/locking/retry behavior is integration tested.
- Real-device and screen-reader acceptance remains pending; Chromium keyboard/axe checks do not establish complete accessibility conformance.
- Visual/content refinement remains deferred: long exact Decimal strings in summaries, dense Analyst evidence columns, narrow mobile plotting area, spacing/proportions and typography/content feedback. Horizontal tables intentionally scroll within labelled keyboard-accessible regions. These are recorded for the user's separate visual review, not broadly redesigned here.

## Recovery material and final runtime

In addition to the verified pre-upgrade restore, a matching post-upgrade database dump and raw-volume archive were saved privately as `.local-backups/post-milestone7-0008.dump` and `.local-backups/post-milestone7-raw.tgz`, with a SHA-256 manifest, dump TOC and raw archive listing. Ingestion was paused for the pair and restarted afterwards. Both checksums and archive readability were checked; the post-upgrade pair was not independently restored. Off-host backup transfer remains an operator task.

The temporary Vite review server on 4173 was stopped after verifying the documented development command. Docker frontend/backend/database and the independent source scheduler remain running. Open http://localhost:5173/ for manual review; `/api/health` and the new catalogue return HTTP 200. There is one canonical served product, with original retail available through its preserved routes.

Local checkpoint commits for this milestone: runtime diagnosis/verified upgrade (`e00f876`), focused correctness/accessibility/source-health corrections (`54b21b9`), and the final live acceptance/operations artifacts commit. No remote push was performed.

Final live privilege inspection confirmed `analytics_reader` has no SELECT privilege on `fuel_price_observations`, `ingestion_runs` or `query_history`. The final health and catalogue probes returned HTTP 200, and only port 5173 remains published for browser review. Normal application-role typed operations continue to serve the new domain through their existing read-only transaction boundary.
