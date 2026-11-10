# Price and cost frontend

The production React/TypeScript application uses the approved Inter typography, navy gradient environment, near-white analytical canvases, ice-blue support and restrained crimson actions. Feature and visual refinement is frozen for the portfolio baseline.

## Routes and components

| Route | Purpose |
|---|---|
| `/` | Concise introduction and entry into the workspace |
| `/app/overview` | Latest dated measurements, trends, contextual supporting indicators and source disclosure |
| `/app/explore` | Validated URL filters, all three domains, history pagination, comparisons and chart/table alternatives |
| `/app/analyst` | Governed question composer, clarification, typed results, evidence and saved history |
| `/app/sources` | Coverage, observation freshness, synchronization health, methodology and publication/check details |

`src/price-cost/components/Shell.tsx` owns horizontal navigation, mobile navigation, route focus and the footer. Page-specific components and CSS remain scoped. `api.ts` uses the existing `/api` base URL and bounded backend contracts; `contracts.ts` is generated from actual Pydantic/OpenAPI models. `useResource` aborts superseded requests and rejects stale completions.

`OverviewMetric`, `History`, `CountryComparison`, `FuelComparisonHistory`, `AnalystResult` and the shared evidence/insight panels compose the analytical interfaces. Legacy retail routes (`/overview`, `/explore`, `/analyst`, `/data`) and their stored history remain accessible directly for compatibility. They are intentionally absent from the current product navigation.

## Numerical and date semantics

`format.ts` centralizes display formatting. Rates, percentage-point differences and index levels generally use two decimals; fuel and FX quotes use three where meaningful. Smaller nonzero changes use explicit precision to avoid misleading zeroes. Exact source strings remain in evidence; only finite chart coordinates are converted to numbers. The frontend never recomputes economic comparisons from rounded display values.

Fuel prices use EUR/L and explicit tax bases. HICP rates are percentages, changes between rates are percentage points, and index levels retain their base. National index levels are not comparable basket prices. FX uses the official EUR base or an explicitly selected backend-derived inverse consistently through figures, charts, tables and insights. Old inverse snapshots without comparison metadata show unavailable comparisons rather than official-direction changes.

Observation periods, publication dates, successful synchronization, latest check and assessment dates remain separate. Source quality/status flags and failed-check warnings are retained.

## History and comparison behavior

Explore requests the newest bounded history page in the selected calendar range (`order=desc`, 260 observations). Its last chronological record supplies the headline. Older records prepend through `previous_end`, preserving the start boundary and 2,000-record client cap. Empty ranges do not fall back to older headlines. Actual count/span is labelled separately from the calendar range.

Overview inflation presents the latest twelve available monthly observations anchored to the inspected measurement, not invented missing months. Annual inflation compares prices with the same month a year earlier; monthly inflation compares the preceding month. A lazy matching-index disclosure uses compatible same-country/category/base observations and labels missing cells.

Fuel country comparison uses up to twelve actual matched weeks, one product and tax basis. Lines break across gaps. Latest prices and signed differences are separate from period averages. Observed ranking reversals identify weeks, never an invented crossing date. Inflation comparison shows the reference once, with chart/table alternatives for peers' signed percentage-point differences.

## Context and evidence

Read this number identifies the selected geography, measurement, unit, period and tax basis. It shows at most two deterministic backend insights rather than a range/average dump: labelled fuel-purchase changes, compatible HICP price-level context and optional same-month EU-27 rates, or selected-direction currency conversion changes. Evidence links retain original precision and source annotations; longer lists use disclosures.

Exact values, methodology/provenance and revisions stay accessible in the shared evidence drawer. Unknown publication dates remain unknown. No LLM generates contextual numerical claims.

## Analyst states and compatibility

The client supports success, clarification, unavailable, blocked and failed outcomes. Clarification preserves the original question/history; cancellation and provider cooldown prevent stale or repeated submissions. A saved result restores through GET history endpoints without calling the provider. Dataset/schema version, assessment date, provenance and original backend answers remain inspectable.

Frontend prominent answer formatting uses typed verified data, not blind string replacement in generated prose. Provider outages and quotas are reported without prepared/fabricated answers.

## Responsive behavior and validation

At 1440 × 900 the default collapsed Overview fits all three domains with a visible footer. Extra warnings, index/source disclosures, long tables and smaller screens retain natural scrolling. No page-height clipping or reduced text is used to force a fit. Keyboard focus, chart/table alternatives, touch targets and reduced-motion support remain part of the shared system.

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` from `frontend/`. Browser tests use deterministic contract-compatible data and do not generate documentation screenshots. The optional live suite is separate and may submit model queries; consult its configuration before running it.

For development, keep Docker on port 5173 and start Vite with `API_PROXY_TARGET=http://127.0.0.1:5173/api npm run dev -- --host 0.0.0.0 --port 4173 --strictPort`. See [local operations](price-cost-local-running.md).

The [portfolio screenshots](screenshots/portfolio/README.md) use real stored data and genuine saved successful history. `npm run screenshots` only reads the live application and never calls the LLM. Older design and milestone review captures were retired during release cleanup. See the [release verification record](verification.md) for executed checks and remaining limitations, including physical-device and screen-reader validation.
