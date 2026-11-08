# Governed price/cost analyst — Milestone 5

The new analyst interprets natural-language intent, then calls the existing typed
price/cost business services. It does **not** generate or execute SQL. The retail
`POST /query` and `/history` APIs keep their original contracts, SQLGlot safeguards,
provider behavior, and saved results. No SQL allowlist, database grant, source
semantics, ingestion behavior or frontend changes are needed.

## API and response

Paths below use the backend root. Prepend `/api` through the existing Docker proxy.

| Method/path | Purpose |
| --- | --- |
| `POST /v1/price-cost/analyst/query` | Interpret one question and execute one approved domain operation |
| `GET /v1/price-cost/analyst/history?limit=20` | Recent price-cost snapshots only; limit 1–100, also capped by `QUERY_HISTORY_LIMIT` |
| `GET /v1/price-cost/analyst/history/{id}` | Restore a supported saved snapshot without LLM or analytical data queries |

Request:

```json
{
  "question": "Compare diesel prices in Germany and France.",
  "clarification": []
}
```

A continuation resends the **original question** and prior question/answer pairs:

```json
{
  "question": "Compare fuel prices",
  "clarification": [
    {"question": "Which two to eight countries should be compared?", "answer": "Germany and France"},
    {"question": "Do you mean petrol (Euro-super 95), diesel, or both?", "answer": "Diesel"}
  ]
}
```

The response includes:

- `dataset="price_cost"`, `schema_version=1`, an explicit domain, request/history
  IDs, creation time and `assessment_date` for the saved freshness evaluation.
- `status`: `success`, `unavailable`, `needs_clarification`, `blocked` or `failed`.
- A short deterministic `answer`, at most three `findings` and three contextual
  `follow_up_questions`, plus optional clarification, assumptions and warnings.
- A discriminated `plan` with one operation, and discriminated `verified_data`
  preserving M4's exact values, units, periods, statuses, sources and limitations.
- `table.columns` (key/label/value type) and `table.rows` for chart/table rendering.
  Decimal values are JSON strings; geography/product/tax/series columns distinguish
  series. Currency inverses have separate value/unit columns.
- Optional `summary_comparison` with actual dates and an explicit official/inverse
  direction; an M4-style structured `explanation` describes what changed, what the
  measurement means and why it might matter.
- Frozen `evidence` for current **and baseline** observations: period, exact value,
  unit, official status/attributes, raw fuel value/unit, run/import metadata,
  artifact ID/hash/URL/retrieval date and available publication/update information.
  An evidence link points to the separate detailed observation/revision API.
- Row counts, truncation, stage timings, and a sanitized error when appropriate.

Example successful response **excerpt**, using illustrative rather than current
published prices (other required response fields are omitted here):

```json
{
  "dataset": "price_cost",
  "schema_version": 1,
  "domain": "fuel",
  "status": "success",
  "answer": "For the week of 2026-11-02, Automotive diesel in Germany was €2.15 per litre, including taxes.",
  "findings": [
    "Between 2026-10-26 and 2026-11-02, Automotive diesel in Germany increased by 0.05 EUR per litre.",
    "This can help compare reported fuel prices when budgeting fuel purchases; your own price and usage determine actual spending."
  ],
  "assessment_date": "2026-11-08",
  "row_count": 1,
  "possibly_truncated": false
}
```

The API can return HTTP 200 with no observations (`unavailable`) or a clarification/
unsupported explanation. Invalid input returns 422. Provider errors are mapped to
502 (invalid output), 503 (unconfigured/unavailable), 504 (timeout), or 429 (rate
limit). Data-read failure returns 503; result/row limits return 422 with no numerical
result. If even the error/snapshot envelope cannot fit `MAX_RESULT_BYTES`, a small
standard error envelope is returned with HTTP 413. No oversized snapshot is saved.
Missing or wrong-dataset history IDs return 404; unsupported/corrupt/oversized saved
versions return 409. No provider response body, secret URL or SQL exception is echoed.

## Planning and execution

1. Check a bounded question/clarification context for clearly unsupported requests.
2. Make at most **one** shared `structured_completion` provider call, using the closed
   `PlannerOutput` JSON schema. The system policy contains approved selections and
   today's Europe/Brussels date, not database observations or private table schemas.
3. Strictly validate the discriminated operation and M4 query contracts. Independently
   check recognized user scope: countries, fuel product, tax basis, category,
   measurement, currency direction and dates. Revalidate at the execution boundary.
4. Execute fixed Python dispatch inside the existing M4 read-only repeatable-read
   transaction with statement/lock timeouts and administrative-role rejection.
5. Compose the answer/table/explanations locally and batch-capture both sides of
   numerical comparisons within that same snapshot. The LLM never sees query results
   and is never asked to calculate figures or produce the final narrative.
6. Save the bounded response in the existing history table using the normal app
   session, separately from the read-only analytical transaction.

The intent model returns no answer, SQL, table/column choice, arbitrary function,
URL, tool call or numerical conclusion. Extra keys, invented operations and invalid
units/currencies/ranges are rejected. Clarification and blocked responses use finite
reason codes mapped to backend-owned messages, so model text cannot inject invented
figures or instructions into those messages either. JSON syntax repair remains the
existing provider wrapper's local repair step; strict semantic validation still follows.

## Approved operations and why they exist

| Operation | Purpose and fixed service behavior |
| --- | --- |
| `fuel_latest` | Latest one/both requested products, selected EU countries and one tax basis; includes the previous available observation |
| `fuel_history` | One country/product/tax series in a bounded dated window; existing historical points and optional returned-window change |
| `fuel_compare` | Two–eight countries, one product/tax basis; M4's exact shared-period comparison |
| `fuel_tax_comparison` | One country/product; exact shared with/without-tax week, using M4 retrieval/alignment and shared Decimal difference/ratio functions |
| `inflation_latest` | One category and annual rate, monthly rate or 2025-based index for selected geographies |
| `inflation_history` | One country/category/measurement; dated history and same-series returned-window comparison |
| `inflation_compare` | Two–eight countries/aggregate, one category/rate; percentage-point differences on a shared month |
| `exchange_latest` | Selected approved EUR pairs, optional dated comparison and derived reciprocal |
| `exchange_history` | One EUR pair, actual reference dates in a bounded window; optional derived inverse values/change |
| `supported_currencies` | Approved currency code/name catalogue; does not imply that every series is currently populated |

These operations cover the requested product questions without model-authored SQL.
No analytical view or new AI database privilege is necessary. The AI reader continues
having no access to new observation, ingestion, provenance or history base tables.
Fixed trusted services use the same application-role read-only boundary as M4;
history persistence uses its existing application write privileges. There is no
arbitrary SQL route, agent tool registry, browsing, refresh endpoint or autonomous action.

## Semantics and concise explanations

M4 remains authoritative for fuel normalization, period selection, annual/monthly
HICP meanings, percentage-point differences, index rules, Decimal changes, ECB
reciprocals, source calendars, freshness and methodological limitations.

- Fuel uses EUR/litre and identical products/tax bases for temporal or country
  comparisons. The explicit tax comparison uses the same reference week for both
  bases. Their reported difference is not an individual invoice or statutory tax rate.
- Annual inflation is a published price change versus the same month a year earlier;
  monthly inflation is versus the preceding month. Subtracting rates yields percentage
  points, not a percent increase in inflation. TOTAL and annual rate are the disclosed
  defaults when no more specific inflation category/measurement is requested.
- Index history compares the same country/category and 2025 base. Country index-level
  comparisons are blocked rather than treated as comparable shopping-basket costs.
- ECB retains `1 EUR = X quote units`. “Show the pound exchange rate” uses that
  documented convention without a needless base-currency clarification. Explicit
  euros-per-pound requests use M4's deterministic reciprocal. Derived inverse
  summaries use the same shared Decimal change functions on the derived rates and
  are labelled `direction="inverse"`; the original observations/table comparisons
  retain their official EUR-base direction and units. No cross-rates are calculated.
- Actual source dates are always shown. Weekends/holidays are never filled. Irregular
  available-period comparisons are disclosed; known TARGET nonpublication gaps use
  the existing source calendar. Observation, publication, retrieval and sync times
  stay separate.

Latest questions lead with the measurement's meaning/value. Explicit “what changed”
questions lead with the calculated change. Histories summarize the first/last returned
observations using the shared M4 comparison/template functions, not model arithmetic.
If a result is truncated, the answer covers **only returned dates**, never claims to
cover the whole requested interval. Table data retain all returned observations even
when the concise narrative highlights only the first two selected series.

General implications are conditional budgeting, purchasing-power or conversion
context, not explanations of causes or estimates of an individual's actual spending.
Estimated/provisional observations and marked baselines are disclosed. Missing values
are not invented, zero-filled or silently removed to make a comparison look complete.
The M3 sparse-absence retention policy and M4 source freshness limitations still apply.

## Clarification and supported wording

Missing material countries/products/currencies/dates prompt one concise question.
Only the original question and **user answers** supply selections; options inside a
clarification question do not count as chosen countries. Already supplied selections
are checked, and a model that repeats such a question is rejected rather than silently
looping. At most three clarification turns are accepted; unresolved requests after
that receive a supported-operation limitation.

Supported grounding is intentionally finite: English country names/adjectives,
approved uppercase country codes (GR maps to EL), known currency names/codes,
selected HICP categories, and common fuel names. Dates support ISO days/months,
English month/year, whole years, “this year” and bounded past/last day/week/month/year
windows. A 2025=100 index base is not interpreted as a requested date range. Unrecognized
or ambiguous wording may need a clearer question; it is not permission to invent scope.

Examples:

- “Latest petrol price in Germany including taxes?”
- “How much has annual inflation changed in Germany?”
- “Show monthly food inflation in Germany from 2025-01 to 2026-10.”
- “Compare annual food inflation in Germany and EU-27.”
- “Compare German diesel prices with and without taxes.”
- “Show German HICP index history over the past year.”
- “Show the pound exchange rate.” / “How many euros per pound?”
- “Show GBP reference rates from 2026-10-01 to 2026-11-06.”

Unsupported: forecasts, private/company/supplier/transaction costs, causal claims,
unapproved geographies/categories/currencies, foreign-currency cross-rates, arbitrary
SQL/private tables, implicit combined cost indices or mixed-frequency joins. Histories
select one semantic series; multi-series trend aggregation/ranking is not supported.

## Limits and provider configuration

The shared provider abstraction remains `foundry_local` or `groq`, configured through
`AI_PROVIDER`, `AI_MODEL`, `AI_API_URL`, `AI_API_KEY` where required, and
`AI_REQUEST_TIMEOUT_SECONDS`. See the existing README provider setup. Credentials are
not included in prompts/history/results. No new dependency or model-specific SDK is added.

The existing provider enforces one JSON object, token/request-timeout bounds and a
100 KB response-validation limit. Network transport remains the existing buffered
HTTP client, not a streaming agent. There is no automatic model retry or extra LLM
wording call. Provider failures and rate limits are explicit and sanitized.

Questions are limited to 2,000 characters, at most three clarification turns (question
1,000 / answer 2,000 characters each), and a combined UTF-8 request bound of
`min(16000, MAX_RESULT_BYTES / 4)`. Histories use at most 100 rows and a 3,660-day
window; M4 month/date rules still apply. `MAX_SQL_ROWS` additionally caps the new
analyst's returned rows, despite its historical configuration name. A request above
that configured history cap fails rather than silently changing user scope.
`MAX_RESULT_BYTES` bounds the full serialized response/snapshot, including evidence.
At most 200 unique observation proofs are captured. Evidence is batched, not fetched
through one HTTP/DB request per chart point. There is no implicit downsampling.

## Saved results and compatibility

The existing `query_history.snapshot` stores `dataset="price_cost"`, schema version,
domain/operation, exact result data, table, deterministic text, assumptions, timings,
source assessment day and frozen current/baseline provenance. `generated_sql` is empty.
No migration is needed. Retail snapshots remain `dataset="eurostat"`, and neither
history list silently relabels or returns the other dataset. Existing unsupported
legacy retail behavior is retained.

Restore returns the validated saved snapshot; it does not call the provider, query
current observations, reword/recalculate figures, or refresh historical freshness.
`assessment_date` and `created_at` make the saved evaluation context explicit. Later
revisions therefore do not change the restored answer or its stored hashes/values.
The live evidence link can show a newer revision; the embedded frozen proof remains
the evidence for the saved numerical answer. Raw artifacts follow M3 retention.
Corrupt/unknown versions fail with 409 rather than being reinterpreted as retail.

As in the existing application, history is application-wide rather than per-user;
this milestone does not introduce authentication/tenant management. Saving failure
rolls back only the history write and preserves an otherwise valid analytical result
with an unsaved-history warning. Logs omit raw provider/error bodies and credentials.

Known limits: English templates and finite intent grounding; provider semantic mistakes
can produce an explicit clarification/rejection; API cutoff dates are not historical
as-known-at reconstruction; underlying sparse-absence retention and conservative
freshness remain; no production-scale load benchmark was performed. These explicit
limits do not widen the SQL security boundary. The typed question/result/history
contracts are ready for Milestone 6's frontend transformation.

## Validation — 8 November 2026

- Full backend suite with disposable PostgreSQL 16 and app/reader/admin roles:
  **270 passed, 2 skipped**. The skips are the existing opt-in external source-adapter
  tests. Regular analyst tests mock the intent model and use deterministic PostgreSQL
  observations, while executing real M4 retrieval/calculations/explanations.
- Coverage includes three-domain intents, operation/type validation, common scope
  grounding, clarification/continuation limits, unsupported requests, injection and
  unauthorized SQL fields, fabricated model answers, malformed/oversized provider
  responses, derived inverse changes, source staleness/outages, sparse/truncated data,
  both sides of evidence, exact snapshot restores after source changes, dataset/version
  isolation, provider failure codes, row/byte limits and retail AI regressions.
- Ruff, Python compilation, Compose configuration, production image build and
  Alembic consistency passed. The existing migration head remains `0008`.
- Real HTTP container smoke tests used an isolated deterministic local provider:
  fuel, inflation and inverse ECB queries succeeded; all three snapshots restored
  exactly, with scoped history and frozen evidence. The provider received exactly
  three calls for three new analyses and no additional calls for restores.
- A separate live configured-provider probe produced valid fuel and inflation
  plans; the test database lacked the selected diesel/food series, so those responses
  correctly reported unavailable data. Both later ECB probes returned provider HTTP
  429 rate limits. This is **partial live-provider validation**, not a claim that all
  four live queries succeeded. Successful three-domain execution is covered by the
  deterministic integration and container tests. Retry live-provider evaluation when
  the configured provider quota permits; no further automatic retries were attempted.
- The pre-existing Starlette/AnyIO deprecation warning remains. No frontend, dependency,
  ingestion, SQL allowlist, grants or Docker infrastructure identifiers changed. Test
  containers are separate from the running application; existing volumes were retained.

Reproduce from `backend/` with disposable `TEST_DATABASE_URL`,
`TEST_ANALYTICS_DATABASE_URL`, `TEST_ADMIN_DATABASE_URL` and `TEST_ALLOW_RESET=1`:

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m pytest -q tests/test_price_cost_analyst.py
.venv/bin/python -m ruff check .
.venv/bin/python -m compileall -q app tests
DATABASE_URL="$TEST_DATABASE_URL" .venv/bin/python -m alembic check
```

The integration fixtures reset the selected disposable database. Keep actual
provider probes separate from ordinary tests, use public non-sensitive questions,
and configure database URLs to a test deployment if saving live-probe history.
