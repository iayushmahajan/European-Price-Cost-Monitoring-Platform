# Milestone 7 — real deployed application

All `live-` screenshots here use the rebuilt Docker frontend at **http://localhost:5173**, the deployed backend and persisted observations downloaded from the three official sources. There is no API interception, synthetic observation or fixture banner. Values refer to the displayed observation dates, not today's transaction prices.

| View | Desktop 1440px | Mobile 390px | Mobile 320px |
| --- | --- | --- | --- |
| Introduction | [Desktop](live-landing-1440.png) | [390px](live-landing-390.png) | [320px](live-landing-320.png) |
| Overview | [Desktop](live-overview-1440.png) | [390px](live-overview-390.png) | [320px](live-overview-320.png) |
| Explore | [Desktop](live-explore-1440.png) | [390px](live-explore-390.png) | [320px](live-explore-320.png) |
| Analyst empty state | [Desktop](live-analyst-1440.png) | [390px](live-analyst-390.png) | [320px](live-analyst-320.png) |
| Analyst saved live result | [Desktop](live-analyst-result-1440.png) | [390px](live-analyst-result-390.png) | [320px](live-analyst-result-320.png) |
| Data & Sources | [Desktop](live-sources-1440.png) | [390px](live-sources-390.png) | [320px](live-sources-320.png) |

[Actual observation evidence](live-evidence-1440.png).

The populated Analyst captures restore a genuine successful Groq-backed query from application history without initiating another model call. Other provider attempts were rate-limited; these screenshots do not imply all live questions succeeded. See [successful fuel/ECB snapshots](live-successful-snapshots.json), [initial provider audit](live-analyst-audit.json) and [read-only live API/numerical audit](live-api-audit.json).

Reproduce using `cd frontend && npx playwright test --config playwright.live.config.ts`. The suite requires the populated Docker application and an existing successful price-cost snapshot, and submits one real provider query. It tests 768px as well, without additional screenshot duplication. Original fixture-labelled Milestone 6B screenshots are retained separately in `../price-cost/`.
