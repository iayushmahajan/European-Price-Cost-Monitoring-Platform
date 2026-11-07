import { expect, test } from "@playwright/test";
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
  await expect(page.locator(".topbar-location strong")).toHaveText("Market overview");
  await expect(page.getByText("One governed dataset")).toBeVisible();
  await page.getByLabel("What would you like to understand?").fill("Compare latest annual change by country");
  await page.getByRole("button", { name: "Analyze market" }).click();
  const resultFigure = page.locator(".query-outcome").getByRole("figure");
  await expect(resultFigure).toBeVisible();
  await expect(resultFigure.locator(".recharts-line")).toHaveCount(3);
  await expect(resultFigure.locator(".difference-chart")).toBeVisible();
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("-5.1 pts");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("eurostat-analysis.csv");
  await page.getByRole("button", { name: /Recent analyses/ }).click();
  await page.getByRole("button", { name: new RegExp(result.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect(page.getByRole("table")).toContainText("104.2");
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
  await page.goto("/");
  await page.getByLabel("What would you like to understand?").fill("Compare performance");
  await page.getByRole("button", { name: "Analyze market" }).click();
  await expect(page.getByText("No SQL has been executed.", { exact: false })).toBeVisible();
  await page.getByLabel("Your clarification").fill("Germany, total retail");
  await page.getByRole("button", { name: "Continue analysis" }).click();
  await expect(page.locator(".query-outcome").getByRole("figure").locator(".recharts-line")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Analyze market" }).click();
  await expect(page.getByRole("alert")).toContainText("timed out");
});
