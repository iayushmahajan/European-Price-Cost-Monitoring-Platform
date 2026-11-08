# Production frontend screenshots — Milestone 6B

These images render the actual production React frontend, not the isolated prototypes. All `fixture-` images use deterministic, contract-compatible illustrative data and visibly identify it. They do **not** show current official values or prove live integration. The production bundle does not import the fixtures.

| Page | Desktop | Mobile 390px | Mobile 320px |
| --- | --- | --- | --- |
| Introduction | [Desktop](fixture-landing-desktop.png) | [390px](fixture-landing-mobile-390.png) | [320px](fixture-landing-mobile-320.png) |
| Overview | [Desktop](fixture-overview-desktop.png) | [390px](fixture-overview-mobile-390.png) | [320px](fixture-overview-mobile-320.png) |
| Explore | [Desktop](fixture-explore-desktop.png) | [390px](fixture-explore-mobile-390.png) | [320px](fixture-explore-mobile-320.png) |
| Analyst, populated result | [Desktop](fixture-analyst-result-desktop.png) | [390px](fixture-analyst-mobile-390.png) | [320px](fixture-analyst-mobile-320.png) |
| Data & Sources | [Desktop](fixture-sources-desktop.png) | [390px](fixture-sources-mobile-390.png) | [320px](fixture-sources-mobile-320.png) |

Additional states: [empty Analyst](fixture-analyst-empty-desktop.png), [source evidence and revisions](fixture-evidence-desktop.png).

The [live backend diagnostic](live-backend-unavailable-desktop.png) uses no data or model fixtures. GET requests from the new frontend were forwarded to the existing Docker `/api` proxy. Its [status log](live-status.json) records the actual 404 response: the currently deployed retail backend does not yet expose the new API. No services, schemas or observations were changed for this capture.

See [implementation and validation notes](../../price-cost-frontend.md) for reproduction commands, scope and remaining live acceptance.
