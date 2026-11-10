# Data sources and measurement rules

The adapters read official fuel workbooks, Eurostat JSON-stat responses and ECB
CSV data. This reference records the formats verified on 8 November 2026, including
units, date meanings and missing-data rules. An unexpected structure raises
`SourceContractError` so an upstream change cannot silently shift values into the
wrong measurement.

Parsers return typed observations; the ingestion service owns database writes.

## Verified fixtures

The fixtures below are unmodified official responses stored under
`backend/tests/fixtures/source_samples/`. A separate derived historical fuel fixture
is described under [Acquisition and history](data-sources.md#acquisition-and-history).

| Fixture | Official source | SHA-256 |
| --- | --- | --- |
| `oil_with_taxes_2026-11-02.xlsx` | EC Weekly Oil Bulletin, prices with taxes | `946947ad4cab9daa786578ac9b2c077d922c0f661671eb5cdb4004bd51763ebb` |
| `oil_without_taxes_2026-11-02.xlsx` | EC Weekly Oil Bulletin, prices without taxes | `ff7b8bbef2beeccabb092c75449a6d775026fa6c9d16def53a89598824beae7c` |
| `hicp_2026-08_2026-10.json` | Eurostat `prc_hicp_minr` JSON-stat API | `122bc977105d04bb7e018f1e555c2bfef555ae8f56c70e2a5fca97cc59a58ea7` |
| `ecb_2026-11-02_2026-11-06.csv` | ECB `EXR` SDMX CSV API | `a9834d7531d67e301d91639efd83c16b752542450b6237f8e119a66e6ca8fbae` |

The European Commission download UUIDs are publication assets, not stable API
identifiers. The ingestion worker discovers current links from
the stable [Weekly Oil Bulletin page](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en)
and retains the resolved URL and content hash.

## European Commission Weekly Oil Bulletin

### Verified contract

- Format: XLSX, one worksheet named `Sheet1`, 31 rows and 7 columns.
- Cell A1 declares `in EUR`; A2 contains the reference week.
- Petrol and automotive diesel are columns B and C.
- Both raw units are `1000 l`, so the normalized value is exactly
  `raw EUR value / 1000 = EUR/litre`.
- Rows 3–29 contain the 27 EU countries; rows 30–31 are EU and euro-area
  weighted aggregates and are not emitted by the country parser.
- The verified files have reference week 2 November 2026. The landing page
  listed the release on 5 November 2026, demonstrating that reference and
  publication dates are different facts.
- Both with-tax and without-tax workbooks use the same verified table shape.
- Tax basis comes from the official document link/title, not the workbook
  cells. The ingestion worker carries that metadata from link discovery into
  parsing; adapter default URLs are retained as verified samples.
- The landing page provides historical price developments from 2005 onward.

The parser emits two `FuelPriceObservation` records per country and preserves:
product, tax basis, raw value, `EUR/1000 litres`, normalized `EUR/litre`,
reference week, optional publication date, and country identity.

The current weekly parser rejects missing petrol or diesel values in the EU-27 rows.
Missing values in unrelated workbook columns do not affect parsing.

### Plain-language interpretation

- **What changed:** compare the same country, product, and tax basis with the
  preceding published week; report both cents per litre and percentage change.
- **What the value means:** “Germany's reported average petrol price was
  €2.128 per litre for the week of 2 November 2026.”
- **What it does not mean:** it is not a guaranteed pump price at a particular
  station, a household's actual spend, or proof of why the price moved.
- **Appropriate comparison:** adjacent available weeks, or the same week one
  year earlier, with identical product and tax treatment.
- **Limitations:** national sampling, weighting, discount, product-composition,
  and reporting practices differ. Cross-country ranks require a comparability
  warning and should not imply identical retail products or collection methods.

## Eurostat HICP

### Verified contract

- Dataset: `prc_hicp_minr`.
- Endpoint: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr`.
- Format: sparse JSON-stat 2.0.
- Dimension order: `freq`, `unit`, `coicop18`, `geo`, `time`.
- Frequency: `M`.
- Supported units:
  - `I25`: index, 2025=100.
  - `RCH_M`: monthly percentage change.
  - `RCH_A`: annual percentage change.
- Approved initial categories: `TOTAL`, `CP01`, `CP03`, `CP04`, `CP06`,
  `CP07`, and `CP11`.
- Approved geographies: EU-27 aggregate and the 27 EU member states.
- Observation periods use `YYYY-MM` and normalize to the first calendar day of
  that month; this date represents a month, not a daily observation.
- Sparse missing cells are counted but not converted to zero.
- Per-cell Eurostat statuses are preserved (`source_status` in API status metadata). The verified October 2026 German
  observations include status `e` (estimated).
- The response update timestamp is preserved with its UTC offset.
- The verified dataset metadata reports coverage from January 1996.

The parser represents index levels and rates as separate `HicpMeasure` values,
which carry their measurement type and unit into ingestion.

### Plain-language interpretation

- **What changed:** annual rate compares a month with the same month one year
  earlier; monthly rate compares it with the preceding month.
- **What the value means:** “German consumer prices were 2.8% higher in October
  2026 than in October 2025” for `TOTAL`, `RCH_A`, value `2.8`.
- **Index meaning:** an index of `103.80` with 2025=100 places the measured price
  level 3.8% above its 2025 reference level; it is supporting context, not a
  price in euros.
- **What it does not mean:** HICP is not an item price, household-specific cost,
  national currency amount, or proof of a cause.
- **Appropriate comparison:** annual rate for year-over-year inflation; monthly
  rate for short-term movement; index only against an explicitly stated base.
- **Limitations:** current observations can be estimated or provisional,
  historical observations can be revised, and country consumption weights
  differ. Missing observations must remain visibly unavailable.

## ECB euro foreign-exchange reference rates

### Verified contract

- Dataflow: `EXR`.
- Series key: `D.{CURRENCY}.EUR.SP00.A`.
- Endpoint pattern:
  `https://data-api.ecb.europa.eu/service/data/EXR/D.USD+GBP+CHF.EUR.SP00.A?format=csvdata`.
- Format: SDMX CSV with explicit series dimensions and observation attributes.
- `CURRENCY_DENOM=EUR`; the official quote is **1 EUR equals X units of the
  quote currency**.
- `OBS_VALUE` is parsed directly into `Decimal`; source precision from
  `DECIMALS` is preserved.
- `OBS_STATUS` and `OBS_CONF` are retained.
- Weekend rows are rejected as unexpected. Missing weekend and TARGET-closing
  dates are accepted because the API represents them by absent rows.
- Weekday continuity is not required, preventing a publication holiday from
  being misclassified as malformed data.
- Historical availability is series-specific; ingestion must retain each
  series' actual first and last observation rather than assume one global span.

The initial configured currencies are CZK, DKK, HUF, PLN, RON, SEK, GBP, CHF,
and USD.

### Plain-language interpretation

- **What changed:** compare the same quote currency across adjacent available
  ECB working-day observations or a clearly stated longer period.
- **What the value means:** “On 3 November 2026, €1 equalled £0.83358.”
- **Direction:** if GBP per EUR increases, one euro buys more pounds; if it
  decreases, one euro buys fewer pounds.
- **What it does not mean:** it is not a bank's customer exchange rate, a live
  market quote, or a guaranteed transaction rate.
- **Appropriate comparison:** previous available ECB working day, not blindly
  the previous calendar day.
- **Limitations:** weekends and TARGET closing days have no observation. Any
  inverse quote must be explicitly calculated as `1 / official rate`, labelled
  as derived, and retain sufficient decimal precision.

## Persistence and provenance

The [database architecture](architecture.md) defines typed current
fact tables with source-specific revision tables, absent rows plus quality metadata
for missing HICP cells, content-addressed raw artifacts, and source-link/publication
metadata retained separately from observation dates. Link discovery and historical
acquisition are handled by the ingestion worker described below.

## Acquisition and history

The ingestion worker discovers current fuel and history workbook URLs from the
official landing page; the original adapter defaults remain verified samples for
compatibility only. See [synchronization operations](development.md)
for batching, source mappings, incremental revision windows and freshness policies.

The historical fuel parser validates the two price sheets in the seven-sheet
`Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx` workbook, named EU-country
motor-fuel columns and `1000 l` units. Source GR maps to catalogue EL. Selected
prices are EUR per 1,000 litres; exchange-rate and other-product columns are not
imported. The downloaded full workbook on 8 November 2026 had SHA-256
`b55d86c3ee2c5fa3788b5b95e789d5d6b207558d54d455fd0120ed1e95e01ffb`.
`oil_history_excerpt.xlsx` is a deterministic **derived fixture**: it retains
original cell values for the two newest reference weeks and price headers, sheet
names and a Notes boundary; unrelated sheets are empty. Its SHA-256 is
`1a6a5922c2b3ccd1c389e1930d7432044e455bf4fdac1e4c06574d6f337eda66`.
It is not represented as an unmodified official artifact.

## Ingestion and revisions

The adapters validate source payloads; the synchronization service publishes them.
Run it manually or through the scheduler described in [development](development.md#synchronization).

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

## Source-to-database mapping

| Source | Series identity / catalogue | Current fact and period | Compared/revision attributes |
| --- | --- | --- | --- |
| Oil Bulletin | country + `FUEL_PRODUCT` + tax basis, `FUEL_PRICE`, `EUR_PER_LITRE` | `fuel_price_observations.reference_week` | raw EUR/1,000 litres, exact EUR/litre, status, known weekly publication date |
| HICP | geo + `ECOICOP_2018` + I25/RCH_M/RCH_A | `hicp_observations.reference_month` (first day representing the month) | value and official status; I25 uses base year 2025, rates use PERCENT |
| ECB | `D.{quote}.EUR.SP00.A`, `EXR_SP00`, `FOREIGN_CURRENCY_PER_EUR` | `exchange_rate_observations.reference_date` | rate, status, confidentiality and published precision |

Decimal values exceeding the existing SQL numeric precision/scale are rejected
instead of silently rounded. All provenance links use source-consistent composite
foreign keys. An identical check leaves each observation's value and provenance unchanged.
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
response retains its last verified value/provenance; ingestion does not infer
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

## Freshness and source dates

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

## Calculation and comparison rules

- **Fuel:** `value` is EUR/litre. Compare only the same country, product and tax
  basis. Absolute change is current minus previous in EUR/litre; relative change
  is `(current - previous) / previous * 100`. Evidence retains the raw
  EUR/1,000-litre value and explicit raw unit.
- **HICP rates:** annual rate describes prices versus the same month a year
  earlier; monthly rate describes prices versus the preceding month. Subtracting
  two published rates yields **percentage points** (`absolute_change_unit="percentage_points"`),
  never a relative percentage change. Negative rates describe lower consumer prices over that rate's stated
  reference interval, not necessarily cheaper prices than the previous API point.
- **HICP indices:** 2025 average equals 100. Within the same country/category/base,
  temporal differences use `index_points` and may also report relative percentage
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

## Data-backed contextual insights


Measurement-insights and fuel compare-history responses return at most two
structured `insights`. Each has a title, factual description, optional exact Decimal
value/unit, reference periods, evidence paths and estimated/provisional flags.
The backend selects and calculates these observations; the frontend formats them
for display. They supplement the returned history, examples and comparisons.

Fuel context uses up to twelve actual observations on/before the inspected week: a change in a clearly labelled 50-litre example, and a current high/low only within that bounded set. An interior observed peak is the reference when the subsequent decline exceeds the absolute first-to-last movement; otherwise the first observation is the reference. This is a transparent context-selection rule, not a statistical-significance claim. Flat histories and returns to an initial price receive different factual wording. Comparison rankings use signed peer-minus-reference prices on matched weeks. Ties do not themselves count as reversals; the most recent unequal ranking reversal is identified between observed weeks, never assigned an invented crossing date. Latest 50-litre differences remain separate from period averages.

HICP annual-rate context requires indices exactly twelve months apart; monthly context requires the preceding calendar month. Index-view context uses the first and last available observations in the bounded window. Geography, category and known index base must match; index-derived percentage change is `(current − reference) / reference × 100`, distinct from index points or percentage-point differences between rates. It need not exactly reproduce the published inflation rate. A same-month/category/type official EU-27 aggregate supplies an optional percentage-point comparison. Missing indices and older aggregates are never substituted or averaged into a price-level change.

FX context scales the selected official or reciprocal backend comparison by 100 in the selected base currency, before fees/margins. Optional `comparison_date` on the existing insight endpoint preserves an explicitly selected historical reference, with a 3,660-day bound and no future dates. A requested date that cannot provide an earlier observation yields factual unavailable context. Evidence links cover the actual compared records. Reference rates remain distinct from transaction quotes.

See the [API guide](api.md) for endpoint behavior and
[development](development.md#raw-storage-backup-and-recovery) for artifact retention.
