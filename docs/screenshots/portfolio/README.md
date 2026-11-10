# Portfolio screenshots

Six screenshots of the running application, each 1440 × 900. Run `npm run screenshots` from `frontend/` with the populated Docker application running. Use `SCREENSHOT_BASE_URL` for a different running instance. `PORTFOLIO_ANALYSIS_ID` selects a successful record available in the returned recent history. The script refuses write requests and never submits a model query.

- [home.png](home.png) — Homepage
- [overview.png](overview.png) — Country overview
- [explore.png](explore.png) — Inflation exploration
- [sources.png](sources.png) — Source coverage and synchronization status
- [fuel-comparison.png](fuel-comparison.png) — Historical comparison canvas
- [analyst.png](analyst.png) — Restored analytical result

The Analyst capture focuses on a saved successful result, with its historical assessment date retained. Fuel prices, inflation and currency rates refer to their displayed observation periods; these images are not claims about today's prices. Source warnings remain visible. Metadata is in [capture notes](capture-notes.json).
