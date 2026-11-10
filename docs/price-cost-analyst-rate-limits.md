# AI Analyst rate-limit investigation — 2026-11-09

## Confirmed runtime and cause

The running backend uses **Groq**, model **`openai/gpt-oss-20b`**, with a 300-second provider timeout and configured credentials. No API keys or raw provider bodies are recorded here.

The existing Docker logs showed real Analyst HTTP 429 responses classified as `provider_rate_limited`, including requests at 12:52:26, 12:52:28 and 12:52:36 UTC, followed by a successful analysis at 12:52:44. No application/nginx rate limiter was configured. Frontend submission is user-triggered and guarded while busy; history restoration makes no LLM call.

A bounded real-provider diagnostic reproduced the specific cause:

```text
provider=groq model=openai/gpt-oss-20b
HTTP 429; code=rate_limit_exceeded; scope=TPM
Limit=8000; Used=4213; Requested=4331
Retry-After=5
x-ratelimit-remaining-requests=999
```

The preceding successful request used 4,168 input tokens and 163 completion tokens (4,331 total). Its remaining-token header was 3,669. The system prompt contained 15,138 message bytes, including the complete operation schema. Two closely spaced requests could therefore exceed the 8,000 TPM budget even with almost all daily requests available. Invalid model responses also consume provider tokens, so immediately resubmitting them compounds throttling.

The observed error was **not exhausted daily quota, missing credentials, or billing failure**. Those conditions are now classified separately when returned by the provider; account-wide usage outside this application is not visible to us.

Groq documents that limits apply across an organization, that token headers refer to TPM and request headers to RPD, and that `Retry-After` is provided on HTTP 429. See [Groq rate-limit documentation](https://console.groq.com/docs/rate-limits). Do not infer RPM or daily token allowance from the wrong reset header.

## Corrections

- Compact the intent schema by removing presentation-only `title` metadata and JSON whitespace. All required fields, references, unions, constraints, defaults and strict validation remain intact. Keep the scope instructions and intent examples that fixed the earlier redundant-clarification failure.
- Limit the short intent completion to 1,200 output tokens (previously 2,500); the legacy retail completion default remains unchanged. This cap is not a claim about actual generated usage.
- At most **one** automatic retry, only for recognized temporary throttling or an explicit provider `Retry-After` instruction. Honor seconds or HTTP-date headers, round fractional waits upward, add small nonnegative jitter, and never restart the overall timeout budget. Waits beyond the 30-second retry bound are returned to the user instead of shortened.
- Do not automatically retry billing/quota exhaustion, daily limits, an individual request exceeding the budget, unknown 429s without a temporary signal, network failures, or invalid model output. Groq's billing *upgrade link* inside a temporary error is not evidence of quota exhaustion.
- Maintain a thread-safe, process-local provider/model cooldown. Repeated clicks during a known cooldown return without another provider call. Missing-hint permanent/unknown errors have a conservative 60-second suppression window; recognized temporary errors without a hint use a one-second initial backoff.
- Forward a sanitized integer `Retry-After` header from the Analyst endpoint and expose it through CORS, without changing analytical JSON or saved snapshot schemas. The UI displays a disabled countdown and prevents new submissions during it. There is no separate frontend automatic retry.
- Log only provider/model, HTTP status, attempt, classified error code, sanitized wait, and allowlisted numeric token counts. Never log keys, endpoint URLs, questions, raw errors, model content, or provider organization IDs.

Provider cooldowns are local to one backend process. Multiple replicas or other applications using the same organization can still consume the shared allowance. This change adds no distributed queue, cache, autonomous agent, SQL access or billing automation.

## Real end-to-end verification

After deploying the fix, one fresh Playwright submission through `http://localhost:4173/app/analyst` and the Docker proxy completed successfully:

```text
HTTP 200; status=success; analysis_id=48
request_id=00f13b0d-2ef7-49ca-9f49-401d07231718
provider attempt=1
prompt_tokens=3094; completion_tokens=162; total_tokens=3256
frontend POSTs=1; evidence records=2; total workflow time=749ms
```

Question: “Compare diesel prices in Germany and France.” The verified same-period, with-tax observations were from **2026-11-02**. The displayed result was France **2.371 EUR/L**, with the backend-calculated difference displayed as **+0.089 EUR/L** versus Germany. Exact underlying values and evidence were retained. Input use decreased by approximately **26%**. This was neither a fixture nor a restored/cached analysis. Live retry recovery was not forced after deployment; temporary retry and cooldown behavior were tested deterministically.

The backend alone was recreated to load the fix. The updated source UI is available on port 4173; the Docker-served frontend on 5173 was not rebuilt. No database schema, source ingestion, stored history, frontend design or infrastructure identifiers changed.

## Validation

- Backend: 297 tests passed with 2 optional live-source skips in the full isolated PostgreSQL suite; all 20 focused rate-limit tests passed. Ruff and compilation passed.
- Frontend TypeScript, ESLint, 71 unit/component tests, and production build passed.
- 20 Playwright tests passed, including the actual countdown/disabled submission behavior, explicit manual retry, existing Analyst states, evidence/history, responsive layouts and automated accessibility checks.
- Compose configuration and Git whitespace checks passed. Sandbox-only backend TestClient runs stalled and were interrupted; equivalent unsandboxed runs passed. Existing Starlette/AnyIO deprecation and browser color-environment warnings are non-fatal.

## Account next steps

No credential, billing or model switch is required to use the now-verified flow. Respect the displayed cooldown rather than repeatedly clicking retry. At the current prompt size, the 8,000 TPM allowance still limits sustained throughput to roughly two full analyses per minute, depending on actual completions and other organization usage.

For faster/shared use, open [Organization Limits](https://console.groq.com/settings/limits), inspect the `openai/gpt-oss-20b` TPM limit and any project limits, then use the console's higher-limit subscription/custom-increase options if appropriate. Check Usage for other applications sharing the organization. A new key in the same organization does not create an independent limit. If a future error explicitly reports quota or billing exhaustion, inspect the account's allowance, usage and billing status; short retries will not solve it. Account changes require the owner and were not performed here.
