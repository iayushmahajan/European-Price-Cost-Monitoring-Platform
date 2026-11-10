# Price/cost API v1

The price-cost read API is served at `/v1/price-cost`. Through the Docker proxy,
browser URLs start with `/api/v1/price-cost`. The OpenAPI page at `/api/docs`
(`/docs` on a direct backend connection) lists the complete request and response
schemas.

These endpoints read stored observations and perform defined calculations. They
do not trigger ingestion or execute user-supplied SQL. The separate
[Analyst API](ai-analyst.md) accepts natural-language questions.

## Endpoints and parameters

The endpoints below use GET. Lists use **comma-separated**, uppercase source
codes with no spaces or duplicates. `EL` is Greece; `EU27_2020` is the EU-27 aggregate.

| Path below `/v1/price-cost` | Parameters / behavior |
| --- | --- |
| `/overview` | `country=DE`, `currency=GBP`, optional `as_of`; two with-tax fuels, TOTAL annual/monthly HICP plus supporting index, and one ECB pair; each retains its own period |
| `/catalogue` | Approved geographies, products, inflation categories/measurements and quote currencies; actual active-series coverage with first/latest stored periods |
| `/sources` | Availability, observation freshness, synchronization state, last successful sync, source dates, methodology and bounded quality summaries |
| `/fuel/latest` | `countries` (default all EU-27 countries), optional `product` (default both), `tax_basis=with_tax`, optional `as_of` |
| `/fuel/history` | Required `country,start,end`; `product=euro_super_95`, `tax_basis=with_tax`, `limit=260` |
| `/fuel/compare` | Required `countries,base_country`; 2–8 countries, `product=euro_super_95`, `tax_basis=with_tax`, optional `period,as_of` |
| `/fuel/compare-history` | The same selections as `/fuel/compare`, restricted to exactly two countries; returns up to twelve matched weeks and period summaries |
| `/inflation/latest` | `countries=EU27_2020,DE`, `category=TOTAL`, `measurement=annual_rate`, optional `as_of` |
| `/inflation/history` | Required `country,start,end`; `category=TOTAL`, `measurement=annual_rate`, `limit=260` |
| `/inflation/compare` | Required `countries,base_country`; 2–8 geographies, `category=TOTAL`, `measurement=annual_rate`, optional `period,as_of`; index comparisons rejected |
| `/exchange-rates/latest` | `currencies` (default all nine approved quotes), `inverse=false`, optional `as_of,comparison_date` |
| `/exchange-rates/history` | Required `currency,start,end`; `inverse=false`, `limit=260` |
| `/evidence/{domain}/{observation_id}` | `domain=fuel\|inflation\|exchange-rates`, positive signed-BIGINT observation ID; `revision_limit=20` (maximum 100) |
| `/insights/{domain}/{observation_id}` | Context for one recorded observation; `inverse=false` and optional `comparison_date` apply to exchange rates |

Products: `euro_super_95`, `automotive_diesel`. Tax bases: `with_tax`, `without_tax`.
HICP categories: `TOTAL,CP01,CP03,CP04,CP06,CP07,CP11`. Measurements: `annual_rate`,
`monthly_rate`, `index`. Quote currencies: `CZK,DKK,HUF,PLN,RON,SEK,GBP,CHF,USD`.
The catalogue distinguishes the approved scope from series actually stored;
registered series with no observations have null coverage dates.

Dates use ISO `YYYY-MM-DD`. Future `as_of/end/period` values are rejected. History
requires `start <= end`, at most 3,660 calendar days, and `1 <= limit <= 2000`.
HICP history boundaries and explicit comparison periods must be the **first day
of the represented month**. ECB comparison dates must precede `as_of` (or today)
by 1–3,660 days. Fuel does not accept the EU aggregate as a country.

Routes using closed Pydantic query models reject unknown parameters, including
arbitrary unit overrides. The insights route validates its declared parameters
directly; catalogue, source and evidence routes have fixed parameters.

Latest results are ordered by source-series key; country comparisons preserve the
requested country order. History supports two page-selection directions:

- `order=asc` (default) selects the earliest bounded page within `start/end`.
  `page.next_start` advances by one month for HICP or one day for other domains.
  Keep the original end date when requesting the next page.
- `order=desc` selects the latest bounded page. `page.previous_end` moves back by
  one month for HICP or one day otherwise. Keep the original start date when
  requesting older data.

Items within either page are returned chronologically. Use the relevant cursor
as the next inclusive boundary while `page.has_more` is true. Missing periods
produce no row, including no zero-valued placeholder. Analyst history operations
use ascending selection.

A valid metric request with no observations returns HTTP 200 with
`available=false`, empty `items` and explicit `missing_selections`. Availability means **some** selected metrics
are available; inspect missing selections for partial coverage. Unsupported codes,
combinations or query windows return 422; unknown observations/domains return
404/422 respectively. PostgreSQL failures, timeouts and unsafe administrative
credentials return sanitized 503 responses. Errors do not echo SQL, connection
credentials or submitted malicious input. The shared request ID remains available.

Example requests:

```text
/api/v1/price-cost/fuel/latest?countries=DE,FR&product=automotive_diesel&tax_basis=with_tax
/api/v1/price-cost/inflation/history?country=DE&category=CP01&measurement=annual_rate&start=2024-01-01&end=2026-10-01
/api/v1/price-cost/inflation/compare?countries=DE,EU27_2020&base_country=DE&period=2026-10-01
/api/v1/price-cost/exchange-rates/latest?currencies=GBP,USD&inverse=true&as_of=2026-11-08&comparison_date=2026-10-08
```

## Responses and numerical values

Decimal fields serialize as **JSON strings**, retaining database precision rather
than converting to binary floats. Original values are never rounded for
calculations. Ratios, derived inverse rates and relative changes use 64-digit
Decimal working precision, rounded half-even to 18 decimal places. Explanation
text uses readable rounded numbers; extremely small nonzero differences are not
rendered as zero. Numerical fields remain the source of truth.

Each metric carries an indicator ID/name, geography/category or currency pair,
reference period and period type, exact value/unit/measurement, official status,
comparison, versioned explanation, observation-age freshness, source code and an
`evidence_path`. That path is relative to the configured API root; prepend `/api`
when using the standard Docker proxy. Responses include source-level attribution
and freshness once rather than repeating detailed evidence in every metric.

The complete field definitions and response examples are in FastAPI's OpenAPI
UI at **http://localhost:5173/api/docs** and its JSON schema at
**http://localhost:5173/api/openapi.json**. See [data sources](data-sources.md#calculation-and-comparison-rules)
for normalization, rate/index distinctions, inverse FX calculations, latest/previous
selection and common-period alignment. `as_of` limits observation periods; it does
not reconstruct an earlier database snapshot.

## Comparisons and measurement context

### Matched fuel history

`GET /v1/price-cost/fuel/compare-history?countries=DE,FR&base_country=DE&product=automotive_diesel&tax_basis=with_tax`

Select exactly two approved countries, one product and one tax basis. Optional
`as_of` and `period` follow the single-period fuel comparison rules. A requested
exact week must exist for both countries. Otherwise, the service finds the latest
shared period within the existing 400-day alignment window.

`latest` contains the compact same-period comparison. `observations` contains up
to twelve shared weeks ending at that aligned period, ordered chronologically.
Each week includes both full metrics, evidence paths and the signed gap
**peer minus base**. Twelve observations can span more than twelve calendar weeks
when coverage is sparse.

Period changes are the last price minus the first price over that same set of
shared weeks. Country averages are equally weighted arithmetic means of the
matched observations; they are not station-weighted or time-weighted estimates.
`absolute_gap_change` is the final absolute gap minus the first absolute gap.
`gap_direction` describes whether the gap widened or narrowed between the
endpoints, not whether it moved steadily or which country was always cheaper.
With only one matched week, period changes and gap direction are unavailable.

Unmatched observations, including newer one-sided weeks, and absent scheduled
weeks between available endpoints are disclosed separately. They are excluded
from both averages and changes and are not interpolated. Retrieval uses a
twelve-period common-date lookup and at most 2,000 rows per series, within the
normal read-only transaction and timeout limits.

### Read this number

`GET /v1/price-cost/insights/{domain}/{observation_id}` returns the selected metric,
up to twelve available observations, its definition and comparison basis, recent
statistics, optional practical examples and at most two structured insights.
No model call or import is triggered. Invalid domains/IDs are rejected and missing
observations return 404. FX accepts `inverse=true` and `comparison_date`; other
domains reject those combinations. The comparison date must be historical and
within 3,660 days of the FX observation; no earlier comparable observation means
no calculated change.

Insights carry actual reference periods, exact values/units where applicable,
evidence links and estimated/provisional flags. Examples use exact source values
before display rounding. The [selection rules](data-sources.md#data-backed-contextual-insights)
explain which history and comparison can support each insight.

## Freshness and evidence

Source responses distinguish latest observation, oldest active series' latest
observation, observation freshness, running/synchronization state, last attempt and
success, source update time and known artifact publication dates. The latest known
publication date uses retrieval evidence from the latest successful check, falling
back to stored-artifact metadata for older imports. Unknown dates remain null;
HICP dataset update time is not an observation publication date.

A source can have stale observations after a successful check, or a failed check
while its previous observations are still current. Per-metric freshness assesses
age today, including historical queries; it does not make an old observation
invalid. The [source policies](data-sources.md#freshness-and-source-dates) define the
thresholds and calendar.

Quality summaries contain the last successful check's missing/revision counts and
up to 20 warning/error codes from the latest run. Counts apply to the source/check,
not the current country filter or lifetime totals. Raw errors, disk paths and
internal cursor data are not exposed. Source omissions do not delete an existing
observation; missing selections and sparse-data limitations remain visible.

Evidence exposes original precise values/units, series dimensions/source key,
current artifact URL/hash/retrieval/publication metadata, import time and bounded
typed before/after revisions with both artifact/run references. Metadata for artifacts
referenced by the returned revisions is included, so hashes/URLs remain inspectable.
It does not serve raw files or expose their disk paths. `revisions_has_more` indicates
older history beyond the requested limit; the database retains the complete history.

## Explanations, security and limits

The backend supplies versioned `explanation` fields: `what_changed`,
`what_it_means`, `why_it_might_matter` and `limitations`. These are Python templates
based on verified observations and calculations. Missing comparisons and irregular
intervals are stated explicitly; no economic cause or individual spending outcome
is inferred. Eurostat `e`/`p` flags are interpreted as estimated/provisional while
full source status strings are preserved. Other source flags are retained without
assigning an unverified meaning.

Reads use fixed, parameterized SQLAlchemy queries within the
[architecture's read-only boundary](architecture.md#service-boundaries). There is
no synchronization endpoint, unrestricted query endpoint or model-readable view.
Result limits and pagination bound the work; full production-load benchmarking,
HTTP caching and deployment-level rate limiting remain future work. Historical
as-known-at reconstruction, cross-currency rates and a precise release calendar
are not implemented. For tests, see [development](development.md#tests-and-live-checks).
