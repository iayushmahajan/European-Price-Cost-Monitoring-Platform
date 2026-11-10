/** Portfolio captures use real HTTP responses and saved history. Never submits an AI query. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const base = process.env.SCREENSHOT_BASE_URL || "http://127.0.0.1:5173";
const output = fileURLToPath(
  new URL("../../docs/screenshots/portfolio/", import.meta.url),
);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const captures = [];
const unexpected = [];
await page.route("**/api/**", (route) => {
  if (route.request().method() !== "GET") {
    unexpected.push(
      route.request().method() + " " + new URL(route.request().url()).pathname,
    );
    return route.abort();
  }
  return route.continue();
});
async function settle() {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
}
async function capture(file, path, focusResult = false) {
  await settle();
  if (focusResult)
    await page
      .locator(
        focusResult === "comparison"
          ? ".pc-fuel-comparison"
          : ".pc-analyst-result",
      )
      .evaluate((e) =>
        e.scrollIntoView({ block: "start", behavior: "instant" }),
      );
  else
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: output + file, fullPage: false });
  captures.push({
    file,
    path,
    viewport: "1440 × 900",
    focus:
      focusResult === "comparison"
        ? "Historical comparison canvas"
        : focusResult
          ? "Restored analytical result"
          : "Page introduction and primary workspace",
  });
}
try {
  await mkdir(output, { recursive: true });
  const historyResponse = await page.request.get(
    base + "/api/v1/price-cost/analyst/history",
  );
  if (!historyResponse.ok())
    throw new Error(
      "Analyst history unavailable: HTTP " + historyResponse.status(),
    );
  const history = await historyResponse.json();
  const requested = process.env.PORTFOLIO_ANALYSIS_ID;
  const saved = requested
    ? history.find((r) => String(r.id) === requested && r.status === "success")
    : history.find(
        (r) => r.status === "success" && r.operation === "fuel_compare",
      ) || history.find((r) => r.status === "success");
  if (!saved)
    throw new Error(
      "A genuine saved successful price-cost analysis is required. No AI request was made.",
    );
  const snapshotResponse = await page.request.get(
    base + "/api/v1/price-cost/analyst/history/" + saved.id,
  );
  if (!snapshotResponse.ok())
    throw new Error("Saved snapshot could not be retrieved");
  const snapshot = await snapshotResponse.json();
  if (snapshot.status !== "success" || !snapshot.verified_data)
    throw new Error("Saved result has no successful verified data");
  for (const [file, path] of [
    ["home.png", "/"],
    ["overview.png", "/app/overview"],
    ["explore.png", "/app/explore?domain=inflation&measurement=annual_rate"],
    ["sources.png", "/app/sources"],
    [
      "fuel-comparison.png",
      "/app/explore?domain=fuel&country=DE&compare=FR&product=automotive_diesel&tax_basis=with_tax",
    ],
  ]) {
    await page.goto(base + path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (file === "overview.png" || file === "explore.png")
      await expect(page.locator(".recharts-line-curve")).toBeVisible();
    if (file === "sources.png")
      await expect(page.locator(".pc-source-row")).toHaveCount(3);
    if (file === "fuel-comparison.png")
      await expect(
        page.locator(".pc-fuel-comparison .recharts-line"),
      ).toHaveCount(2);
    if (file === "explore.png")
      await page.getByRole("button", { name: "1 year", exact: true }).click();
    await capture(
      file,
      new URL(page.url()).pathname + new URL(page.url()).search,
      file === "fuel-comparison.png" ? "comparison" : false,
    );
  }
  await page.goto(base + "/app/analyst");
  await page.getByRole("button", { name: "Recent analyses" }).click();
  const index = history
    .filter((r) => r.dataset === "price_cost")
    .findIndex((r) => r.id === saved.id);
  if (index < 0) throw new Error("Saved snapshot is not in price-cost history");
  const restored = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith("/analyst/history/" + saved.id) &&
      r.status() === 200,
  );
  await page.getByRole("dialog").locator(".pc-history-row").nth(index).click();
  await restored;
  await expect(page.locator("#pc-answer")).toBeVisible();
  await expect(page.getByText(/Saved analysis · assessed/)).toBeVisible();
  await expect(page.locator(".pc-answer-figures")).toBeVisible();
  await capture("analyst.png", "/app/analyst", true);
  if (unexpected.length)
    throw new Error(
      "Unexpected write request prevented: " + unexpected.join(", "),
    );
  const notes = {
    captured_at: new Date().toISOString(),
    data: "Real stored observations; no fixture responses or model requests",
    analyst: {
      id: saved.id,
      question: saved.question,
      status: snapshot.status,
      assessment_date: snapshot.assessment_date,
      schema_version: snapshot.schema_version,
    },
    captures,
    model_queries: 0,
  };
  await writeFile(
    output + "capture-notes.json",
    JSON.stringify(notes, null, 2) + "\n",
  );
  await writeFile(
    output + "README.md",
    "# Portfolio screenshots\n\nSix real-application captures, each 1440 × 900. Run `npm run screenshots` from `frontend/` with the populated Docker application running. Set `SCREENSHOT_BASE_URL` or `PORTFOLIO_ANALYSIS_ID` to select another live deployment or existing successful record. The script refuses write requests and never submits a model query.\n\n" +
      captures
        .map((c) => "- [" + c.file + "](" + c.file + ") — " + c.focus)
        .join("\n") +
      "\n\nThe Analyst capture focuses on a genuine saved result, with its historical assessment date retained. Fuel prices, inflation and currency rates refer to their displayed observation periods; these images are not claims about today's prices. Source warnings remain visible. Metadata is in [capture notes](capture-notes.json).\n",
  );
  console.log(JSON.stringify(notes, null, 2));
} finally {
  await browser.close();
}
