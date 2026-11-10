# Price and cost source contracts — Milestone 1

This document records the source formats verified on 8 November 2026 for the
European Price & Cost Monitoring Platform. The parsers are deliberately strict:
an upstream structural change raises `SourceContractError` instead of producing
plausible but incorrectly labelled observations.

No parser in this milestone writes to the database.

## Verified fixtures

The deterministic tests use small, unmodified official responses under
`backend/tests/fixtures/source_samples/`.

| Fixture | Official source | SHA-256 |
| --- | --- | --- |
| `oil_with_taxes_2026-11-02.xlsx` | EC Weekly Oil Bulletin, prices with taxes | `946947ad4cab9daa786578ac9b2c077d922c0f661671eb5cdb4004bd51763ebb` |
| `oil_without_taxes_2026-11-02.xlsx` | EC Weekly Oil Bulletin, prices without taxes | `ff7b8bbef2beeccabb092c75449a6d775026fa6c9d16def53a89598824beae7c` |
| `hicp_2026-08_2026-10.json` | Eurostat `prc_hicp_minr` JSON-stat API | `122bc977105d04bb7e018f1e555c2bfef555ae8f56c70e2a5fca97cc59a58ea7` |
| `ecb_2026-11-02_2026-11-06.csv` | ECB `EXR` SDMX CSV API | `a9834d7531d67e301d91639efd83c16b752542450b6237f8e119a66e6ca8fbae` |

The European Commission download UUIDs are publication assets, not stable API
identifiers. A later ingestion milestone must discover the current links from
the stable [Weekly Oil Bulletin page](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en)
and retain the resolved URL and content hash.

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
- Tax basis is established by the official document link/title; it is not
  encoded inside the workbook cells. The adapter therefore uses distinct
  official default URLs for each basis, and future link discovery must carry
  that metadata into parsing.
- The landing page provides historical price developments from 2005 onward.

The parser emits two `FuelPriceObservation` records per country and preserves:
product, tax basis, raw value, `EUR/1000 litres`, normalized `EUR/litre`,
reference week, optional publication date, and country identity.

Missing petrol or diesel values are rejected for this initial EU-27 scope.
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
- Supported units in this proof of concept:
  - `I25`: index, 2025=100.
  - `RCH_M`: monthly percentage change.
  - `RCH_A`: annual percentage change.
- Approved initial categories: `TOTAL`, `CP01`, `CP03`, `CP04`, `CP06`,
  `CP07`, and `CP11`.
- Approved geographies: EU-27 aggregate and the 27 EU member states.
- Observation periods use `YYYY-MM` and normalize to the first calendar day of
  that month; this date represents a month, not a daily observation.
- Sparse missing cells are counted but not converted to zero.
- Per-cell Eurostat statuses are preserved. The verified October 2026 German
  observations include status `e` (estimated).
- The response update timestamp is preserved with its UTC offset.
- The verified dataset metadata reports coverage from January 1996.

The parser keeps index levels and rates as different `HicpMeasure` values. A
percentage rate cannot be accidentally labelled as an index.

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

## Milestone 2 resolution

The following questions were carried into Milestone 2:

- Whether source-native observations and revisions use separate typed fact
  tables or typed current tables plus an append-only revision table.
- How publication dates are discovered and persisted for historical Oil
  Bulletin files, whose workbook contains a reference date but not the web-page
  publication timestamp.
- Whether missing HICP coordinates are stored explicitly or represented through
  coverage/quality metadata.
- The policy for retaining raw official artifacts outside test fixtures.
- Current-link discovery and schema-versioning for future Oil Bulletin releases.

They are now resolved in
[Price and cost database architecture](price-cost-database-architecture.md):
typed current fact tables with source-specific revision tables, absent rows plus
quality metadata for missing HICP cells, content-addressed local raw artifacts,
and source-link/publication metadata retained separately from observation dates.

## Milestone 3 acquisition and history

The ingestion worker now discovers all current fuel and history URLs from the
official landing page; the original adapter defaults remain verified samples for
compatibility only. See [synchronization operations](price-cost-synchronization.md)
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
