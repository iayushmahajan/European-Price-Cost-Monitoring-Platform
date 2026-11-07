import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { clarification, result, retailOverview } from "../src/test/fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/history/1")
      ? result
      : path.endsWith("/history")
        ? [{ id: 1, question: result.question, dataset: "eurostat", status: "success", row_count: 1, created_at: result.created_at }]
        : path.endsWith("/retail/overview")
          ? retailOverview
          : path.endsWith("/examples")
            ? [{ id: 1, question: "Compare Germany and the EU-27 over the latest 12 months." }]
            : [];
    await route.fulfill({ json: data });
  });
});

test("market comparison chart, table, CSV and restored history", async ({ page }) => {
  await page.route("**/api/query", (route) => route.fulfill({ json: {
    ...result,
    columns: ["period", "germany_index", "eu_27_index", "germany_minus_eu_27_gap"],
    rows: [["2026-07-01", "98.6", "104.9", "-6.3"], ["2026-08-01", "99.9", "105", "-5.1"]],
    row_count: 2,
  } }));
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: /Retail signals/ })).toBeVisible({ timeout: 15_000 });
  const overviewLine = page.locator(".hero-visual .recharts-line-curve").first();
  await expect(overviewLine).toBeVisible();
  expect((await overviewLine.boundingBox())!.width).toBeGreaterThan(400);
  await page.getByRole("link", { name: "Explore markets" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  const exploreLine = page.locator(".light-chart .recharts-line-curve").first();
  await expect(exploreLine).toBeVisible();
  expect((await exploreLine.boundingBox())!.width).toBeGreaterThan(400);
  await page.getByRole("tab", { name: "Categories" }).click();
  await expect(page.getByRole("heading", { name: "Category position" })).toBeVisible();
  await page.getByRole("tab", { name: "Countries" }).click();
  await expect(page.getByRole("table", { name: "Country benchmark" })).toContainText("Germany");
  await page.getByRole("tab", { name: "Change detection" }).click();
  await expect(page.getByRole("heading", { name: "Unusual recent movements" })).toBeVisible();
  await page.getByRole("link", { name: "AI analyst" }).click();
  await page.getByLabel("Ask a question about European retail").fill("Compare latest annual change by country");
  await page.getByRole("button", { name: "Ask analyst" }).click();
  const resultFigure = page.locator(".query-outcome").getByRole("figure");
  await expect(resultFigure).toBeVisible();
  await expect(resultFigure.locator(".recharts-line")).toHaveCount(3);
  await expect(resultFigure.locator(".difference-chart")).toBeVisible();
  await page.getByText("Evidence & methodology").click();
  await expect(page.getByText("Question interpreted as")).toBeVisible();
  await page.getByText("Inspect SQL").click();
  await expect(page.locator(".sql-code")).toContainText("SELECT");
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("-5.1 pts");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("eurostat-analysis.csv");
  await page.getByRole("button", { name: result.analysis!.follow_up_questions[0] }).click();
  await expect(page.getByLabel("Ask a question about European retail")).toHaveValue(result.analysis!.follow_up_questions[0]);
  await page.getByRole("button", { name: /Recent analyses/ }).click();
  await page.getByRole("button", { name: new RegExp(result.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect(page.getByRole("table")).toContainText("104.2");
});

test("browser history and mobile navigation preserve route behavior", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("link", { name: "Explore markets" }).click();
  await page.getByRole("link", { name: "Data & sources" }).click();
  await expect(page).toHaveURL(/\/data$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole("heading", { name: "Explore markets" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/data$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "AI analyst" }).click();
  await expect(page).toHaveURL(/\/analyst$/);
  await expect(page.getByRole("heading", { name: "Ask the market" })).toBeVisible();
});

test("clarification, line chart, and failed query on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = 0;
  await page.route("**/api/query", async (route) => {
    calls++;
    if (calls === 1) return route.fulfill({ json: clarification });
    if (calls === 2) {
      expect(route.request().postDataJSON().clarification[0].answer).toBe("Germany, total retail");
      return route.fulfill({ json: { ...result,
        columns: ["period", "retail_index"],
        rows: [["2026-06-01", "103.7"], ["2026-07-01", "104.6"]], row_count: 2 } });
    }
    return route.fulfill({ status: 504, json: { error: { message: "The query timed out." } } });
  });
  await page.goto("/analyst");
  await page.getByLabel("Ask a question about European retail").fill("Compare performance");
  await page.getByRole("button", { name: "Ask analyst" }).click();
  await expect(page.getByText("No query has been executed yet.", { exact: false })).toBeVisible();
  await page.getByLabel("Your clarification").fill("Germany, total retail");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".query-outcome").getByRole("figure").locator(".recharts-line")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Ask analyst" }).click();
  await expect(page.getByRole("alert")).toContainText("timed out");
});

test("all four workspaces have no serious accessibility violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/overview", "/explore", "/analyst", "/data"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")), `${path} accessibility violations`).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overview");
  const mobile = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(mobile.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("all workspaces remain usable at tablet and mobile widths", async ({ page }) => {
  for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/overview", "/explore", "/analyst", "/data"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} overflows at ${viewport.width}px`).toBeTruthy();
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    }
  }
});
