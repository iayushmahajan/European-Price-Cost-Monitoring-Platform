# Price & Cost production frontend — Milestone 6B

## Migration plan and compatibility

The approved Refined Concept 02 is implemented through scoped semantic tokens and production components, not the prototype App. Milestone 6A files are preserved untracked and are excluded from checkpoint commits.

- `/`: introduction with an honest non-numerical preview (no sample represented as live).
- `/app/overview`: discovery and current situation, few controls.
- `/app/explore`: bounded analytical filters, history and common-period comparisons.
- `/app/analyst`: governed price-cost analyst and versioned snapshots.
- `/app/sources`: source health, observation freshness, coverage and evidence.
- Existing `/overview`, `/explore`, `/analyst`, `/data` remain the original retail application. `/legacy` links to its overview. Existing retail APIs/history/storage are untouched.

Checkpoints: 6B.1 client/contracts/tokens/routes; 6B.2 Overview/Explore/evidence; 6B.3 Analyst/Sources; 6B.4 integration, fixtures, browser/accessibility and live review. Each checkpoint is validated and committed locally; no push.

## API and type boundary

The existing Axios base URL remains `VITE_API_BASE_URL || /api`. Product calls append `/v1/price-cost`; the Docker nginx proxy already strips `/api`. No proxy service or backend changes are required.

Response contracts are generated from the actual FastAPI OpenAPI serialization schemas with `PYTHONPATH=backend backend/.venv/bin/python frontend/scripts/generate-price-cost-types.py`. Decimal output is typed as strings. Defaulted response fields are emitted by the current FastAPI routes. Display rounding operates on decimal digits; only chart coordinates use finite JS numbers. Calculations/explanations remain backend authoritative.

The resource hook keys requests by all semantic filters, cancels superseded transport with AbortController, and ignores late completions. Data from a prior selection cannot be shown as a new selection. Evidence paths are restricted to the product evidence route; outbound source URLs allow HTTP(S) only.

## Design

One page-level navy gradient surrounds near-white analytical surfaces. Semantic foreground roles change inside `.pc-canvas`. Inter and ProductMark are reused. Pink marks primary entry/comparison/submission interactions and active navigation; it does not imply economic direction. Existing retail styles remain scoped separately through the new `pc-` classes.

## Validation log

Checkpoint results and final limitations are recorded as implementation proceeds. Backend, ingestion and database schemas are outside this migration's scope.

### Checkpoint 6B.1

Type checking, production build and lint passed; 23 unit/component tests passed after separating legacy App tests from the new root. Local commit `94be60f`.

### Checkpoint 6B.2

Real catalogue/overview/latest/history/compare/evidence clients, URL validation, all three domains, table alternatives, status and irregular-interval display, gap-aware charts, bounded pagination and cancellation are implemented. The default country is disclosed, and the EU aggregate is confined to Explore inflation. Type/build/lint and 28 tests passed. Deterministic fixtures are generated/validated by the real Pydantic models and use backend Decimal calculations/templates; they are test-only and never imported by production routes.

Live inspection found that the existing Docker image exposes only seven retail paths and the database is at Alembic `0007` with no price-cost observation tables. No migrations, database writes, volume changes or backend rebuilds were performed: schema changes are explicitly out of scope. This prevents populated live M4/M5 verification in the current deployment. Fixture validation is not represented as live validation.

### Checkpoint 6B.3

Analyst integrates `POST /analyst/query` and both history endpoints, retains original question/clarification context, supports all five result statuses, handles provider HTTP errors, allows browser cancellation, ignores late results after editing, and validates dataset/version/result bounds. The empty state has examples but no generated answer. Restored evidence uses frozen snapshot fields; links explicitly open current stored revisions separately. Follow-ups populate the composer without an automatic model call.

Sources integrate `/sources` and catalogue coverage, distinguish observation freshness from synchronization health, and progressively disclose publication/retrieval/success timestamps, quality summaries, policy and methodology. Null metadata is never displayed as zero or current. Tests cover a current observation with a failed synchronization.

Type checking, build and lint passed; 39 tests passed, including success/clarification/unavailable/blocked/failed, 429 handling, wrong-domain responses, unsupported history, exact continuation payload and cancellation. Live provider success is unverified because the running deployment lacks M4/M5 and its tables; no provider outage answer is fabricated.

## Integrated endpoints

All paths below are relative to `/v1/price-cost` through the existing `/api` browser proxy. Request names and response types follow [the API contract](price-cost-api.md) and [the analyst contract](price-cost-analyst.md).

| Endpoints | Production use |
| --- | --- |
| `GET /catalogue`, `/overview` | Supported selections and current country context |
| `GET /fuel/latest`, `/fuel/history`, `/fuel/compare` | Product/tax-specific prices and backend common-period country comparisons |
| `GET /inflation/latest`, `/inflation/history`, `/inflation/compare` | Category/measurement-specific HICP and compatible country comparisons |
| `GET /exchange-rates/latest`, `/exchange-rates/history` | Official EUR quotes and explicitly labelled backend-derived inverses |
| `GET /sources` | Observation freshness, synchronization health and quality summaries |
| `GET /evidence/{fuel\|inflation\|exchange-rates}/{id}` | Exact source observations, artifacts and revisions |
| `POST /analyst/query` | Original question and bounded clarification history |
| `GET /analyst/history`, `/analyst/history/{id}` | Saved price-cost analyses and model-free snapshot restoration |

No synchronization endpoint, generated SQL, direct database connection or autonomous tool execution is exposed by the new frontend.

## Components, state and numerical semantics

`src/price-cost/api.ts` owns transport; `contracts.ts` owns generated response types; `selection.ts` and `use-selection.ts` validate URL state against catalogue coverage. `resource.ts` manages keyed requests and retry. Page components compose the shared shell, controls, metric summaries, history, comparisons, evidence panels and analytical results. Lazy routes keep the existing retail and new product bundles separate.

Overview deliberately has fewer controls than Explore. It shows a latest metric and a short trend, with independently dated supporting measurements. Explore adds product/tax/category/measurement selectors, dates, comparison controls and pagination. Country defaults are application defaults, not geolocation. Index-level country comparisons are disabled. Invalid codes, impossible dates and incompatible choices cannot become arbitrary API requests. History windows are bounded to 3,660 days, each request to 260 observations, and the client presentation to 2,000 observations with an explicit limit notice. Additional pages must advance the cursor.

Backend comparisons supply values, reference periods and change units. The frontend does not recalculate economic changes or reciprocals. Fuel uses EUR/litre; HICP distinguishes percentages, percentage points and index levels; ECB retains the official EUR base direction and reference-rate limitation. Missing observations are never zero. Irregular intervals remain labelled, and chart lines break across backend-marked gaps. Exact values remain available in tables/evidence; JavaScript numbers are used only for finite chart coordinates. Brand colors never encode economic good/bad meaning.

Source panels separate reference periods, publication dates, retrieval/import times, successful synchronization and assessment dates. Unknown dates remain unknown. Analyst snapshots preserve the historical dataset/schema version, assessment date and frozen evidence; opening current stored revisions is a separate, labelled action. Browser cancellation stops waiting for the request and rejects late responses; it does not guarantee cancellation of server-side model execution or history persistence.

## Final validation and evidence

Executed from `frontend/`:

```sh
npm run typecheck
npm run test
npm run build
npm run lint
npx playwright test --workers=2
```

Executed from the repository root:

```sh
PYTHONPATH=backend backend/.venv/bin/python frontend/scripts/generate-price-cost-types.py
PYTHONPATH=backend backend/.venv/bin/python frontend/scripts/build-price-cost-fixtures.py
docker compose config --quiet
git diff --check
```

The completed checks passed: 39 unit/component tests across nine files, production build, TypeScript, ESLint, and 13 browser tests (eight product and five legacy retail). Product browser checks include 16 full WCAG A/AA axe scans with no violations, 320px/390px mobile and 768px layouts, page-overflow assertions, keyboard navigation, dialog focus restoration and reduced motion. Automated axe checks are not a substitute for manual assistive-technology acceptance.

Earlier validation caught and corrected JSON import compatibility in Node, ambiguous select labels, controlled-dialog focus restoration and old tests assuming the root was still retail. Full-page screenshot capture now resets scroll before capture. These fixes were followed by passing runs.

Fixtures are built using the real Pydantic models and backend Decimal comparison/explanation functions. Rebuild them with the command above; they are test-only and excluded from production imports/bundles. The fixtures cover product/tax changes, common-period comparisons, rates/index distinctions, inverse quotes, missing/estimated/provisional/irregular observations, revisions, stale data with failed synchronization, request races and pagination, analyst statuses/clarification/provider errors and model-free restoration.

| Validation category | Result and limit |
| --- | --- |
| Implemented and automated | Production components, typed clients, filters, exact formatting, routes, error states and legacy regression checks passed |
| Fixture-validated | Populated M4/M5 workflows and failure conditions; intercepted contract-compatible responses, not live official observations |
| Live read-only inspection | Existing Docker proxy health responded; `/api/v1/price-cost/catalogue` returned HTTP 404. Existing backend exposes retail routes and DB reports Alembic `0007` |
| Not live-validated | Populated official-source frontend queries, governed live-provider analysis, saved M5 snapshots in the deployed DB, and production Docker frontend deployment |
| Not executed in this scope | Backend test suite/database migration checks; no backend/schema/ingestion changes were made |

The repository already contains migration `0008` and the newer API services, but the running deployment does not serve them. This is an environment/deployment mismatch, not evidence of provider failure. No migration, ingestion, backend rebuild, database write or volume change was used to bypass this milestone's boundaries.

### Screenshot review

See the [screenshot gallery](screenshots/price-cost/README.md). These are browser renders of the actual production React code. Populated screenshots visibly identify the contract-fixture data. Desktop captures are 1440px wide; mobile captures include both 320px and 390px. The separate live diagnostic shows the real deployed backend's unavailable response, without a data or model fixture. Its browser transport forwards GET requests through the existing Docker proxy; it does not represent a new production deployment.

Reproduce fixture screenshots with `npx playwright test e2e/price-cost.spec.ts --grep 'real frontend screenshots' --workers=1`. To reproduce only the read-only live diagnostic, start the new Vite frontend on `127.0.0.1:4173` and run `node scripts/capture-price-cost-live.mjs`; the existing Docker proxy must be available on `127.0.0.1:5173`.

## Remaining acceptance and Milestone 7

The frontend implementation is ready for integrated deployment acceptance, with populated live acceptance still pending. A separately authorized operational update must deploy the repository's existing backend/migration, populate official observations through the existing ingestion workflow, and then exercise the new frontend against those services and a live AI provider. No backend contract expansion is required by this implementation.

Complete real-device, screen-reader and zoom testing, and evaluate chart density with the full deployed catalogue and long historical series. At 320px the evidence table and long analytical answer require vertical scrolling; table alternatives prioritize exact values over compact chart labels. The legacy retail workflows, APIs and stored records remain available; no storage cleanup or relabelling was performed. Earlier isolated design artifacts remain preserved and excluded from these commits.
