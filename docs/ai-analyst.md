# Governed price/cost Analyst

The price-cost Analyst turns a question into one approved operation, validates its
scope and calls the same services as the read API. The model interprets the
question; backend code retrieves observations, calculates comparisons and writes
the answer. Query results are not sent back to the model.

This document covers the question API, execution limits and saved results. The
original retail `POST /query` and `/history` interfaces remain separate, with
SQLGlot-validated queries and their own result history.

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

Responses identify `dataset="price_cost"`, `schema_version=1`, the domain,
request/history IDs and `assessment_date`. Status is `success`, `unavailable`,
`needs_clarification`, `blocked` or `failed`. Successful results contain a direct
backend-written answer, up to three findings and follow-up questions, typed
`verified_data`, a chart/table and evidence. Decimal fields remain strings.

`summary_comparison` and `explanation` retain actual comparison periods and quote
direction. Frozen evidence covers current and baseline observations, including
exact values/statuses, raw fuel values, run/import metadata and artifact
hash/URL/retrieval/publication information. Detailed field definitions are in
[OpenAPI](http://localhost:5173/api/docs); [saved results](#saved-results-and-compatibility)
explains why embedded evidence can differ from a later live evidence read.

The API can return HTTP 200 with no observations (`unavailable`) or a clarification/
unsupported explanation. Invalid input returns 422. Provider errors are mapped to
502 (invalid output), 503 (unconfigured/unavailable), 504 (timeout), or 429 (rate
limit). Data-read failure returns 503; result/row limits return 422 with no numerical
result. If even the error/snapshot envelope cannot fit `MAX_RESULT_BYTES`, a small
standard error envelope is returned with HTTP 413. A response larger than the configured limit is not saved.
Missing or wrong-dataset history IDs return 404; unsupported/corrupt/oversized saved
versions return 409. No provider response body, secret URL or SQL exception is echoed.

## Planning and execution

1. Check a bounded question/clarification context for clearly unsupported requests.
2. Request one intent plan through `structured_completion`, with at most one
   transport retry for temporary HTTP 429 throttling. It uses the closed
   `PlannerOutput` JSON schema. The system prompt contains approved selections and
   today's Europe/Brussels date, but no database observations or private table schemas.
3. Strictly validate the discriminated operation and domain query contracts. Independently
   check recognized user scope: countries, fuel product, tax basis, category,
   measurement, currency direction and dates. Revalidate at the execution boundary.
4. Dispatch the operation to its Python service inside the API's read-only repeatable-read
   transaction with statement/lock timeouts and administrative-role rejection.
5. Build the answer, table and explanations locally. Capture evidence for both
   sides of each numerical comparison in the same database snapshot. The model never sees query results
   and is never asked to calculate figures or produce the final narrative.
6. Save the response, subject to the size limit, in the history table through a
   separate application write session.

The model contract allows only a plan, clarification reason or unsupported-request
reason. It has no fields for SQL, arbitrary functions, URLs or a numerical answer.
Extra keys, invented operations and invalid units/currencies/ranges are rejected. Clarification and blocked responses use finite
reason codes mapped to backend-owned messages, so model text cannot inject invented
figures or instructions into those messages either.

If JSON syntax is malformed, the provider wrapper attempts local syntax repair
before validating the schema again. It does not request a second model response
to repair the plan.

## Supported operations

| Operation | Purpose and fixed service behavior |
| --- | --- |
| `fuel_latest` | Latest requested product or both products, selected EU countries and one tax basis; includes the previous available observation |
| `fuel_history` | One country/product/tax series in a bounded dated window; chronological points and an optional change over the returned window |
| `fuel_compare` | Two–eight countries, one product/tax basis; the API's exact shared-period comparison |
| `fuel_tax_comparison` | One country/product; exact shared with/without-tax week, using domain retrieval/alignment and shared Decimal difference/ratio functions |
| `inflation_latest` | One category and annual rate, monthly rate or 2025-based index for selected geographies |
| `inflation_history` | One country/category/measurement; dated history and same-series returned-window comparison |
| `inflation_compare` | Two–eight countries/aggregate, one category/rate; percentage-point differences on a shared month |
| `exchange_latest` | Selected approved EUR pairs, optional dated comparison and derived reciprocal |
| `exchange_history` | One EUR pair, actual reference dates in a bounded window; optional derived inverse values/change |
| `supported_currencies` | Approved currency code/name catalogue; does not imply that every series is currently populated |

Each operation maps to a fixed Python service call. The price-cost Analyst has no
SQL-generation or autonomous tool-execution path. Its analytical reads use the
application role in the same read-only transaction as the product API; saving
history uses a separate application write transaction.

The retail SQL reader still has no access to price-cost observation, ingestion,
provenance or history tables. Adding an Analyst operation does not grant the model
access to those tables.

## Answer semantics

The Analyst uses the [same calculation and comparison rules](data-sources.md#calculation-and-comparison-rules)
as the API. Fuel requires compatible product/tax selections; a tax-basis
comparison uses one shared week and is not a statutory tax rate. Inflation defaults
to TOTAL and annual rate when no narrower selection is requested. Rate differences
use percentage points, and cross-country index-level comparisons are blocked.

“Show the pound exchange rate” uses the official EUR-base convention. Explicit
euros-per-pound questions select a derived reciprocal. Inverse summaries carry
`direction="inverse"`, while official source observations and their comparison
fields keep their original direction; inverse table columns are separate.
Cross-currency rates are unsupported.

Latest questions lead with the measurement's meaning/value. Explicit “what changed”
questions lead with the calculated change. Histories summarize the first/last returned
observations using the shared deterministic comparison/template functions, not model arithmetic.
If a result is truncated, the answer covers **only returned dates**, never claims to
cover the whole requested interval. Table data retain all returned observations even
when the concise narrative highlights only the first two selected series.

General implications are conditional budgeting, purchasing-power or conversion
context, not explanations of causes or estimates of an individual's actual spending.
Estimated/provisional observations and marked baselines are disclosed. Missing values
are not invented, zero-filled or silently removed to make a comparison look complete.
The ingestion sparse-absence retention policy and API source freshness limitations still apply.

## Clarification and supported wording

Missing material countries/products/currencies/dates prompt one concise question.
Only the original question and **user answers** supply selections; options inside a
clarification question do not count as chosen countries. Already supplied selections
are checked, and a model that repeats such a question is rejected rather than silently
looping. At most three clarification turns are accepted; unresolved requests after
that receive a message explaining the supported scope.

The scope validator recognizes a defined vocabulary: English country names/adjectives,
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

The shared provider interface supports `foundry_local` and `groq`, configured through
`AI_PROVIDER`, `AI_MODEL`, `AI_API_URL`, `AI_API_KEY` where required, and
`AI_REQUEST_TIMEOUT_SECONDS`. See the [README provider setup](../README.md#ai-configuration-and-limits).
Credentials are used for transport only and are not stored in prompts, history or results.

The provider wrapper requires one JSON object, bounds tokens and request time, and
rejects response bodies larger than 100,000 bytes before schema validation. The
HTTP response is buffered, so this check is a validation limit rather than a
streaming download limit. Malformed plans and non-temporary failures are
not retried. A temporary provider HTTP 429 may receive one bounded transport retry;
there is no extra LLM wording call. Provider failures and rate limits are explicit and sanitized.

Questions are limited to 2,000 characters, at most three clarification turns (question
1,000 / answer 2,000 characters each), and a combined UTF-8 request bound of
`min(16000, MAX_RESULT_BYTES / 4)`. Histories use at most 100 rows and a 3,660-day
window; API month/date rules still apply. `MAX_SQL_ROWS` also caps price-cost
Analyst rows; the setting retains its name from the retail SQL implementation. A request above
that configured history cap fails rather than silently changing user scope.
`MAX_RESULT_BYTES` bounds the full serialized response/snapshot, including evidence.
At most 200 unique observation proofs are captured. Evidence is batched, not fetched
through one HTTP/DB request per chart point. There is no implicit downsampling.

## Saved results and compatibility

`query_history.snapshot` stores `dataset="price_cost"`, schema version,
domain/operation, exact result data, table, deterministic text, assumptions, timings,
source assessment day and frozen current/baseline provenance. `generated_sql` is empty.
Retail snapshots use `dataset="eurostat"`. Each history endpoint filters its own
dataset, so an old retail result is not relabelled as a price-cost analysis.

Restore returns the validated saved snapshot; it does not call the provider, query
current observations, reword/recalculate figures, or refresh historical freshness.
`assessment_date` and `created_at` make the saved evaluation context explicit. Later
revisions therefore do not change the restored answer or its stored hashes/values.
The live evidence link can show a newer revision; the embedded frozen proof remains
the evidence for the saved numerical answer. Raw artifacts follow the [synchronization retention policy](development.md#raw-storage-backup-and-recovery).
Corrupt/unknown versions fail with 409 rather than being reinterpreted as retail.

History is shared across the application; authentication and tenant management
are not implemented. If saving fails, only the history write is rolled back. An
otherwise valid analytical result is still returned with an unsaved-history warning. Logs omit raw provider/error bodies and credentials.

The Analyst recognizes a limited English vocabulary and uses English answer
templates. A model can still misinterpret a question; scope checks may reject its
plan or ask for clarification. An API cutoff date does not reconstruct what was
known at that time, and the source's sparse-data and freshness limitations still
apply. Production-scale load testing has not been performed.

The [frontend architecture guide](architecture.md#frontend) describes how these
responses, clarification turns and saved results are presented.

For test commands and the distinction between fixture and live-provider checks,
see [development](development.md#tests-and-live-checks).

## Provider rate limits and recovery

Provider configuration and local startup are documented in the [root README](../README.md#ai-configuration-and-limits) and [local setup guide](development.md). A configured provider does not guarantee available quota.

A provider HTTP 429 can mean temporary token/request throttling, an exhausted
daily allowance, billing/quota exhaustion or an oversized request. The backend
classifies these separately. Check the sanitized error code and `Retry-After`
rather than assuming every 429 will resolve with another request.

- The compact intent schema retains strict validation, constraints and grounding. The intent completion limit is 1,200 tokens; legacy retail defaults are unchanged.
- At most one automatic retry is allowed for recognized temporary throttling or explicit provider `Retry-After` instructions. Seconds and HTTP-date headers are honored, fractional waits round upward, and small nonnegative jitter is added within the original timeout budget. Waits beyond the 30-second retry bound are returned to the user instead of shortened.
- Billing/quota exhaustion, daily limits, oversized requests, unknown 429s without a temporary signal, network failures and invalid model output are not automatically retried.
- A thread-safe process-local provider/model cooldown suppresses repeated calls. Unknown/permanent errors without a hint receive a conservative 60-second suppression; recognized temporary errors without a hint start at one second. Cooldowns do not coordinate multiple replicas or other applications sharing the account.
- The endpoint returns a sanitized `Retry-After` header exposed through CORS. The UI disables submission during the countdown and offers manual retry afterward; it adds no automatic retry loop. Analytical JSON and saved snapshot schemas are unchanged.
- Logs allowlist provider/model, HTTP status, attempt, classified error code, wait and numeric token counts. Credentials, questions, model content, raw provider bodies and organization identifiers are omitted.

For repeated temporary failures, respect the cooldown and inspect the provider's organization/project limits and other applications' usage. A new key in the same organization does not create an independent quota. For explicit billing or quota exhaustion, the account owner must inspect allowance and billing; short retries cannot resolve it. See [Groq rate-limit semantics](https://console.groq.com/docs/rate-limits) and [organization limits](https://console.groq.com/settings/limits).

A configured provider or a saved successful result does not establish current
account availability. A fresh provider check is opt-in and consumes allowance;
see [development](development.md#tests-and-live-checks).
