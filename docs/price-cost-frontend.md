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
