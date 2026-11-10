# Price/cost API v1 — Milestone 4

The fixed-query product API lives at `/v1/price-cost`. Docker's existing reverse
proxy adds `/api`, so browser URLs start `/api/v1/price-cost`. OpenAPI at `/docs`
(`/api/docs` through the proxy) is the complete typed request/response contract.
The existing retail API, AI SQL allowlist, reader grants and ingestion interfaces
are unchanged. There is no refresh, forecast, conversion-trading or combined-score
endpoint.

## Endpoints and parameters

All endpoints are GET. Lists use **comma-separated**, uppercase source codes with
no spaces or duplicates. `EL` is Greece; `EU27_2020` is the EU-27 aggregate.

| Path below `/v1/price-cost` | Parameters / behavior |
| --- | --- |
| `/overview` | `country=DE`, `currency=GBP`, optional `as_of`; two with-tax fuels, TOTAL annual/monthly HICP plus supporting index, and one ECB pair; each retains its own period |
| `/catalogue` | Approved geographies, products, inflation categories/measurements and quote currencies; actual active-series coverage with first/latest stored periods |
| `/sources` | Availability, observation freshness, synchronization state, last successful sync, source dates, methodology and bounded quality summaries |
| `/fuel/latest` | `countries` (default all EU-27 countries), optional `product` (default both), `tax_basis=with_tax`, optional `as_of` |
| `/fuel/history` | Required `country,start,end`; `product=euro_super_95`, `tax_basis=with_tax`, `limit=260` |
| `/fuel/compare` | Required `countries,base_country`; 2–8 countries, `product=euro_super_95`, `tax_basis=with_tax`, optional `period,as_of` |
| `/inflation/latest` | `countries=EU27_2020,DE`, `category=TOTAL`, `measurement=annual_rate`, optional `as_of` |
| `/inflation/history` | Required `country,start,end`; `category=TOTAL`, `measurement=annual_rate`, `limit=260` |
| `/inflation/compare` | Required `countries,base_country`; 2–8 geographies, `category=TOTAL`, `measurement=annual_rate`, optional `period,as_of`; index comparisons rejected |
| `/exchange-rates/latest` | `currencies` (default all nine approved quotes), `inverse=false`, optional `as_of,comparison_date` |
| `/exchange-rates/history` | Required `currency,start,end`; `inverse=false`, `limit=260` |
| `/evidence/{domain}/{observation_id}` | `domain=fuel\|inflation\|exchange-rates`, positive signed-BIGINT observation ID; `revision_limit=20` (maximum 100) |

Products: `euro_super_95`, `automotive_diesel`. Tax bases: `with_tax`, `without_tax`.
HICP categories: `TOTAL,CP01,CP03,CP04,CP06,CP07,CP11`. Measurements: `annual_rate`,
`monthly_rate`, `index`. Quote currencies: `CZK,DKK,HUF,PLN,RON,SEK,GBP,CHF,USD`.
The catalogue distinguishes the approved scope from series actually stored;
registered series with no observations have null coverage dates.

Dates use ISO `YYYY-MM-DD`. Future `as_of/end/period` values are rejected. History
requires `start <= end`, at most 3,660 calendar days, and `1 <= limit <= 2000`.
HICP history boundaries and explicit comparison periods must be the **first day
of the represented month**. ECB comparison dates must precede `as_of` (or today)
by 1–3,660 days. Unknown parameters, including arbitrary unit overrides, are
rejected. Fuel does not accept the EU aggregate as a country.

Latest ordering is deterministic by source-series key; country comparisons preserve requested country order. History accepts `order=asc` (the unchanged default) or `order=desc` to select the earliest or latest bounded page within `start/end`. Returned items are always chronological. Ascending pages return `page.next_start` (next month for HICP, next day otherwise); keep the original end date. Descending pages return `page.previous_end` (previous month for HICP, previous day otherwise); keep the original start date. Use the relevant cursor as the next inclusive boundary while `page.has_more` is true. No row or zero is inserted for an absent period. Analyst history operations retain ascending selection.

A valid empty selection returns HTTP 200 with `available=false`, empty `items`
and explicit `missing_selections`. Availability means **some** selected metrics
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

## Response and calculation contract

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

- **Fuel:** `value` is EUR/litre. Compare only the same country, product and tax
  basis. Absolute change is current minus previous in EUR/litre; relative change
  is `(current - previous) / previous * 100`. Evidence retains the raw
  EUR/1,000-litre value and explicit raw unit.
- **HICP rates:** annual rate describes prices versus the same month a year
  earlier; monthly rate describes prices versus the preceding month. Subtracting
  two published rates yields **percentage points**, never a relative percentage
  change. Negative rates describe lower consumer prices over that rate's stated
  reference interval, not necessarily cheaper prices than the previous API point.
- **HICP indices:** 2025 average equals 100. Within the same country/category/base,
  temporal differences use index points and may also report relative percentage
  change. Index levels across countries do not measure comparable basket costs;
  the country-comparison endpoint rejects them. API model validation enforces
  index/rate units, base-year rules and month semantics.
- **ECB:** preserve `1 EUR = value quote-currency units`, e.g. `unit=GBP/EUR`.
  Compare only the same EUR/quote pair. An increase means one euro buys more quote
  units. `inverse=true` additionally returns `inverse_rate = 1 / official value`,
  `inverse_unit=EUR/GBP` and `inverse_is_derived=true`; it never reverses the official
  value or its comparison direction. The optional `inverse_comparison` contains the same reference observation and comparison basis calculated over reciprocal values, with `absolute_change_unit=EUR/GBP`. Inverse metadata is null when not requested; older saved snapshots may lack this comparison. The existing measurement-insights endpoint accepts `inverse=true` for FX only, returning statistics over individual reciprocal observations and an inverse-direction conversion example. No reciprocal of an average is substituted for the mean of reciprocals.
  Selected currencies are presented side by side with each pair's own dated
  changes, not ranked or subtracted as if different currency units were equal.

`comparison` includes availability, actual reference period/value/status, signed
absolute change and its unit, optional relative percentage change, elapsed days,
comparison basis and a consecutive-period flag. Missing comparison data leaves
changes null. A zero denominator never produces an invented ratio.

`latest` means the latest **stored reference period** on/before `as_of` or today's
Europe/Brussels calendar date, independently for each selected series. Default
`previous` means that same series' strictly earlier available observation. A
consecutive comparison requires exactly seven days for fuel, the preceding
calendar month for HICP, or the preceding standard TARGET publication day for ECB.
Irregular spacing is flagged `consecutive=false` and the explanation explicitly
avoids calling it an ordinary consecutive weekly/monthly/daily change. It does not
invent a reason for the gap. Standard weekend/TARGET gaps are expected for ECB.

ECB's explicit `comparison_date` chooses each pair's latest stored observation
on/before that date. It reports the actual date and
`basis=on_or_before_requested_date`; `consecutive` is null for this deliberately
longer comparison. If the current observation predates or equals the requested
comparison date, no change is calculated. A rate is never invented for a weekend.
There is no tolerance-based interpolation: an old comparison remains explicitly
old through its actual reference date and elapsed-days field.

History's first point may compare with the immediately preceding stored point
**outside the requested window**; subsequent points compare with their preceding
available point. Pagination preserves this rule. Missing values remain absent.

Country comparisons require the same product/tax basis or HICP category/rate
measurement and an exact shared reference period. Without `period`, choose the
latest period shared by **all** requested countries in the preceding 400 days
relative to `as_of/today`. With `period`, every country must have that exact period.
If any is missing, return no numerical country differences. Values are compared
with `base_country`: fuel differences use EUR/litre and optional relative percent;
rate differences use percentage points. These are same-period national
comparisons, not changes over time or rankings of an individual's costs.

`as_of` is a **reference-period cutoff**, not a historical database/publication
snapshot. Historical responses use the latest verified revisions currently stored.
No daily/monthly/weekly measurements are joined into a shared synthetic period.

## Explanation rules

Every temporal metric has `explanation.rule_version="1"` and:

1. `what_changed`: calculated direction/magnitude and actual comparison dates,
   or an explicit unavailable message; a separate warning for irregular spacing.
2. `what_it_means`: national average fuel price with tax basis, correctly scoped
   HICP annual/monthly/index interpretation, or official EUR-based reference rate.
3. `why_it_might_matter`: conditional budgeting, purchasing-power or conversion
   context, without claiming to measure an individual's actual costs.
4. `limitations`: source/domain comparability, missing-data policy and applicable
   estimated/provisional caveats.

These are deterministic Python templates, with no LLM calls, forecasts or causal
claims. HICP source `e`/`p` flags become `estimated`/`provisional`; complete status
strings are retained. Other sources' status strings are preserved without guessing
an unverified interpretation; those two interpreted flags are null. A flag is a
source marking, not a guarantee that an observation will never be revised.

Illustrative response **excerpts** (synthetic values, omitted fields indicated by
prose rather than invalid JSON):

```json
{
  "period": "2026-11-02",
  "value": "2.150000000000000000",
  "unit": "EUR/litre",
  "product": "automotive_diesel",
  "tax_basis": "with_tax",
  "comparison": {
    "available": true,
    "reference_period": "2026-10-26",
    "reference_value": "2.100000000000000000",
    "absolute_change": "0.050000000000000000",
    "absolute_change_unit": "EUR/litre",
    "relative_change_percent": "2.380952380952380952",
    "consecutive": true
  }
}
```

The fuel explanation would state the €0.05/litre increase between those two dates,
explain that €2.15/litre includes taxes, and distinguish national averages from
actual station prices and personal fuel spending.

```json
{
  "period": "2026-10-01",
  "value": "3.2000000000",
  "unit": "percent",
  "measurement_type": "annual_rate",
  "comparison": {
    "available": true,
    "reference_period": "2026-09-01",
    "reference_value": "3.0000000000",
    "absolute_change": "0.2000000000",
    "absolute_change_unit": "percentage_points",
    "relative_change_percent": null
  },
  "explanation": {
    "rule_version": "1",
    "what_changed": "Between 2026-09-01 and 2026-10-01, the Food annual inflation rate in Germany increased by 0.2 percentage points.",
    "what_it_means": "Consumer prices for Food in Germany were 3.2% higher than the same month a year earlier in 2026-10.",
    "why_it_might_matter": "This provides context for changes in consumer purchasing power; it does not measure your own cost changes.",
    "limitations": ["Country baskets and weights differ. Index levels are not comparable shopping-basket costs."]
  }
}
```

```json
{
  "period": "2026-11-03",
  "value": "0.833580000000000",
  "base_currency": "EUR",
  "quote_currency": "GBP",
  "unit": "GBP/EUR",
  "quote_convention": "1 EUR = value quote-currency units",
  "inverse_rate": "1.199644905108088006",
  "inverse_unit": "EUR/GBP",
  "inverse_is_derived": true
}
```

## Freshness, provenance and security

Source responses separate latest observation, oldest active series' latest
observation, observation freshness, persisted synchronization state, running state,
last attempt/success timestamps, successful source-update timestamp and latest
artifact publication metadata. The latest known file publication date comes from
the latest successful check's retrieval evidence, including repeated content hashes,
with stored-artifact metadata as a fallback for older imported runs. Fuel publication dates are also available on the
observation; unknown historical publication dates stay null. HICP's dataset update
time is not relabelled as an observation's publication date.

Freshness reuses Milestone 3's policies (fuel 14 days, HICP 65 days, ECB previous
completed TARGET publication day), evaluated at read time in Europe/Brussels.
`sources[].observation_freshness=unavailable` means no active stored observation;
`stale` can coexist with a successful check, and `failed` synchronization can coexist
with a still-current previous dataset. Per-metric freshness describes that specific
observation's age **today**, even for historical queries; it is not a judgment that
historical data is invalid. Standard TARGET calendar handling and conservative
monthly thresholds are documented in the synchronization guide.

Quality summaries expose last successful check's missing/revision counts and up
to 20 warning/error codes from the latest run. These counts are source/check-wide,
not counts for the current country filter or lifetime totals. They omit raw error
messages, local paths and internal cursor contents. Sparse HICP and historical
fuel absence does not imply withdrawal: Milestone 3 can retain an already stored
value subsequently omitted by a source response. Each such response continues to
carry the limitation and missing-cell summary; entirely absent unregistered series
are reflected through missing selections, not a fabricated zero or freshness date.

Evidence exposes original precise values/units, series dimensions/source key,
current artifact URL/hash/retrieval/publication metadata, import time and bounded
typed before/after revisions with both artifact/run references. Metadata for artifacts
referenced by the returned revisions is included, so hashes/URLs remain inspectable.
It does not serve raw files or expose their disk paths. `revisions_has_more` indicates
older history beyond the requested limit; the database retains the complete history.

The layers are `api/schemas/price_cost*`, thin `api/routes/price_cost`, and
`services/price_cost/{repository,calculations,explanations,product}`. The repository
uses only fixed SQLAlchemy SELECTs with bound selections. Each request runs on
the existing application role inside a **REPEATABLE READ, READ ONLY** PostgreSQL
transaction, with 5-second statement and 1-second lock timeouts. Administrative
roles (superuser/create-role/create-database/bypass-RLS) fail closed. No new role,
grant, unrestricted query endpoint or AI-readable view is introduced. Application
credentials still have their existing ingestion privileges outside these read-only
requests; this is not a new independently provisioned database reader role.

Latest/previous reads use bounded lateral index lookups against the existing
unique `(series_id, reference period)` indexes. Histories select at most limit+1
rows plus one predecessor; source/catalogue coverage uses first/last index lookups
rather than scanning all facts. Country alignment scans at most 400 days for up
to eight selected series. Metric composition performs no per-observation database
queries. There is no in-memory cache that could hide a successful ingestion or
mix versions within one response; repeatable-read snapshots keep all sections
consistent during concurrent publication.

Known limits: data coverage follows the configured ingestion scope; numeric units
cannot be overridden; explanations are English/versioned templates; no historical
as-known-at reconstruction, inferred missing-cell withdrawal, currency cross-rate,
retail-cost forecast or precise release-calendar model is implemented. Large
histories are paginated rather than downsampled. Full production-load benchmarking,
HTTP caching/rate limiting and more sophisticated deployment observability remain
operational follow-up work. Milestone 5 can use deliberately governed analytical
read models without changing the existing AI reader until separately approved.

## Validation — 8 November 2026

- Full backend suite with disposable PostgreSQL 16 and app/reader/admin test URLs:
  **205 passed, 2 skipped**. The skips are the existing opt-in network source-adapter
  tests; ordinary API tests use deterministic fixtures and fixed dates. Coverage
  includes contracts, units, arithmetic, inverse rates, estimated/provisional flags,
  missing periods, shared-country dates, pagination, source/publication freshness,
  revision evidence, query-count bounds, administrative-role rejection, read-only
  enforcement, and existing retail/AI security regressions.
- A separate live-data smoke flow imported October 2026 onward into a **clean
  disposable database**: EU fuel workbooks/history, German TOTAL HICP, GBP/USD ECB.
  Fuel, inflation, exchange-rate and overview requests all returned HTTP 200, and
  detailed evidence reads for all three domains returned traceable artifact hashes.
  Schema-test fixtures deliberately use alternate ECB external-key forms; clear
  those disposable fixtures before live ingestion rather than mixing the two setups.
- The final production image built successfully and served six real HTTP smoke
  requests: overview, catalogue, sources and each domain's latest endpoint, including
  derived inverse rates. Existing application containers were not replaced.
- Ruff, Python compilation, Compose configuration, `alembic check` (no upgrade
  operations) and migration head `0008` passed. No new migration is necessary.
- The existing local Starlette/AnyIO deprecation warning remains. No frontend,
  dependency, AI SQL allowlist, grants or ingestion behavior changed. No production
  backfill/deployment or full production-load benchmark was performed.

From `backend/`, run the complete suite with disposable `TEST_DATABASE_URL`,
`TEST_ANALYTICS_DATABASE_URL`, `TEST_ADMIN_DATABASE_URL` and `TEST_ALLOW_RESET=1`:

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m pytest -q tests/test_price_cost_api.py
.venv/bin/python -m ruff check .
.venv/bin/python -m compileall -q app tests
DATABASE_URL="$TEST_DATABASE_URL" .venv/bin/python -m alembic check
```

Integration fixtures reset the selected test database. The admin URL is used only
for the negative privilege test; without it that test is skipped. CI provisions all
three disposable role URLs. For separate live-data checks, use the synchronization
CLI against a clean test database and then call the documented API examples; no
synchronization endpoint is exposed.

## Historical fuel comparisons and observation insights (7.5.4B)

Two additive, read-only endpoints keep contextual arithmetic in the deterministic backend; existing response contracts and Analyst operations are unchanged.

- `GET /v1/price-cost/fuel/compare-history?countries=DE,FR&base_country=DE&product=automotive_diesel&tax_basis=with_tax`: exactly two approved countries; optional `as_of` and exact `period` follow the existing fuel comparison rules. `latest` retains the compact same-period result. `observations` contains the latest **up to 12 shared observation weeks**, in chronological order, each with both full fuel metrics/evidence paths and the signed gap **peer minus base**. A selected exact week must exist for both countries; it is not silently replaced. Without one, latest alignment uses the existing 400-day common-period policy. Historical matched weeks precede that aligned endpoint and may span longer than twelve calendar weeks when coverage is sparse.
- `GET /v1/price-cost/insights/{domain}/{observation_id}`: the recorded observation plus its latest up to twelve available observations at or before that period, meaning, comparison-basis guidance, recent statistics, an optional example and a focused limitation. Unknown domain/invalid ID is rejected; an absent observation returns 404. No model request or ingestion is triggered.

Fuel period changes are last minus first price **within the identical set of shared weeks**. Country averages are equally weighted arithmetic means over those same observations, not station-weighted or time-weighted cross-country estimates. `absolute_gap_change` is the final absolute gap minus the first absolute gap; `gap_direction` describes the endpoints, not a monotonic movement or which country was always cheaper. With only one matched week, period changes and gap direction are unavailable. Observed unmatched weeks (including more recent one-sided weeks) and absent scheduled weeks between available endpoints are disclosed separately, excluded from both means and changes, and not interpolated. Retrieval uses a twelve-period common-date lookup and a bounded 2,000-row read per series; existing PostgreSQL read-only transactions and timeouts apply.

Recent insight ranges/means use the selected series only. HICP rate differences use percentage points, index differences use index points and retain the index base, fuel uses EUR/L, and FX uses the official quote-currency-per-EUR direction. An average of published inflation rates is not cumulative inflation. Examples multiply the exact stored price by 50 litres, or the official reference rate by 100 EUR, before display rounding. All new arithmetic uses Decimal; averages reuse the existing 18-decimal derived-ratio policy. The frontend retains its current backend-provided comparison when a user requested a special FX comparison date, rather than replacing that basis with the insight endpoint's default previous-observation comparison.

These endpoints expose no synchronization actions, SQL execution, administrative records or new database permissions. Evidence continues through the existing bounded evidence endpoint. No schema or ingestion change is involved.

### Contextual insights (Milestone 7.5.4D)

The existing measurement-insights and fuel compare-history responses additionally return at most two structured `insights`. Each includes a title, factual description, optional exact Decimal value/unit, actual reference periods, source evidence paths and estimated/provisional flags. Existing history, example and comparison fields retain their meanings. The frontend formats numbers; no LLM writes these insights.

Fuel context uses up to twelve actual observations on/before the inspected week: a change in a clearly labelled 50-litre example, and a current high/low only within that bounded set. An interior observed peak is the reference when the subsequent decline exceeds the absolute first-to-last movement; otherwise the first observation is the reference. This is a transparent context-selection rule, not a statistical-significance claim. Flat histories and returns to an initial price receive different factual wording. Comparison rankings use signed peer-minus-reference prices on matched weeks. Ties do not themselves count as reversals; the most recent unequal ranking reversal is identified between observed weeks, never assigned an invented crossing date. Latest 50-litre differences remain separate from period averages.

HICP annual-rate context requires indices exactly twelve months apart; monthly context requires the preceding calendar month. Index-view context uses the first and last available observations in the bounded window. Geography, category and known index base must match; index-derived percentage change is `(current − reference) / reference × 100`, distinct from index points or percentage-point differences between rates. It need not exactly reproduce the published inflation rate. A same-month/category/type official EU-27 aggregate supplies an optional percentage-point comparison. Missing indices and older aggregates are never substituted or averaged into a price-level change.

FX context scales the selected official or reciprocal backend comparison by 100 in the selected base currency, before fees/margins. Optional `comparison_date` on the existing insight endpoint preserves an explicitly selected historical reference, with a 3,660-day bound and no future dates. A requested date that cannot provide an earlier observation yields factual unavailable context. Evidence links cover the actual compared records. Reference rates remain distinct from transaction quotes.
