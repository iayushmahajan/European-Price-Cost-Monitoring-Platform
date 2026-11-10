# Portfolio release verification

Verified on 10 November 2026 for the European Price & Cost Monitoring Platform. The release includes the previously approved Milestones 1–7.5 implementation. Milestone 8 freezes application features/design and adds repository cleanup, release documentation and real-data portfolio captures.

## Executed checks

| Check | Actual result |
|---|---|
| Backend unit/API/PostgreSQL suite | **311 passed, 2 optional live-source tests skipped** |
| Backend Ruff and Python compilation | Passed |
| Frontend unit/component suite | **102 passed** |
| Frontend TypeScript, ESLint and production build | Passed |
| Complete deterministic Playwright suite | **51 passed**, including legacy retail workflows, clarification/failure states, responsive UI, chart labels, keyboard focus and Axe scans |
| Read-only live Playwright suite | **4 passed, 1 provider-request test deliberately skipped** |
| Read-only deployed API audit | **29 checks**, including 9 representative observations checked against exact evidence and domain arithmetic |
| Docker Compose configuration | Passed |
| Docker production frontend and backend test-image builds | Passed |
| Documented sync CLI syntax | `--help` passed; no source import was triggered |
| Actual database and available migration head | **0008**; no schema changes in release cleanup |
| Existing application health | API and both database connections reported `ok`; provider health is configuration/availability metadata, not proof of quota |
| Documentation/image links | No broken local links; all six README images exist and are **1440 × 900** |
| Credential/artifact review | No tracked `.env`, key files or database dumps; known token/private-key patterns and database-URL review found no credentials in release files |
| Git whitespace | Passed |

Backend integration tests used the separate disposable `price_cost_m7_test` database. No application tables, Docker volumes, raw artifacts or stored analyst records were deleted/reset. No migrations or ingestion runs were needed for this cleanup.

The production Docker frontend was rebuilt and served through Nginx on port 5173 with real `/api` responses. The read-only browser tests exercised all primary routes, country/product/tax/category/measurement selection, official/inverse FX, historical comparisons, URL restoration, source evidence, desktop/mobile navigation and legacy direct routes. Responsive/a11y checks covered desktop, tablet, 390px and 320px with no detected Axe violations or horizontal page overflow in the tested states.

## Portfolio evidence

[Six portfolio screenshots](screenshots/portfolio/README.md) use actual stored data. `npm run screenshots` blocks non-GET browser API requests and restores a genuine saved successful analysis. The selected record is **#48**, “Compare diesel prices in Germany and France,” assessed **9 November 2026**. No model query was submitted during release preparation. Capture metadata is retained with the images; full database/history dumps are not published.

Stored observation counts at inspection: 10,368 fuel, 212,555 HICP and 4,257 exchange-rate observations. These are an environment snapshot, not guaranteed coverage on a fresh clone. A new installation requires official-source ingestion.

## Cleanup and compatibility

- Retired isolated `design-exploration/` prototypes, milestone/review screenshot galleries, obsolete retail portfolio images and the old unavailable-backend capture script.
- Removed screenshot generation from ordinary fixture browser tests while preserving their functional and accessibility checks; optional live artifacts now stay in ignored test-output directories.
- Replaced the old retail-first root README with current product/setup/architecture information and a concise separation of implemented and future work.
- Removed the obsolete Legacy retail footer entry from current product navigation. Direct retail routes, APIs, migrations, data and historical records remain intact.
- Retained source contracts, database architecture, API/Analyst guides, synchronization/backup operations, reusable project design skills and historical verification records.
- Hardened ignored patterns for environment variants, private keys, dumps and generated artifacts. Private `.local-backups/` material remains excluded and untouched.

A verified recovery archive of retired local prototypes/captures was made outside the repository before cleanup. It is not included in the public release.

## Limitations and checks not performed

- No fresh provider request was made. Successful historical snapshots and deterministic failure/retry tests do not prove current provider quota or billing availability. The optional provider test requires `RUN_LIVE_AI=1`.
- Existing HICP observation-age and ECB synchronization/freshness warnings remain visible. They were not hidden or repaired by fabricating data or forcing unrelated ingestion.
- Full historical source downloads and production data recovery were not repeated for this release. The earlier [Milestone 7 acceptance record](milestone-7-validation.md) documents the backup/upgrade/recovery work; startup wiring, CLI syntax and migrations were checked through configuration, running services and isolated PostgreSQL tests.
- Physical-device and screen-reader testing remain pending. Automated accessibility scans do not replace them.
- Hosted multi-tenant deployment, authentication and delivered automated reports are not implemented. The repository documents a local Docker portfolio baseline.

The [historical retail verification record](legacy-retail-verification.md) is retained separately and is not presented as current price-cost test coverage.
