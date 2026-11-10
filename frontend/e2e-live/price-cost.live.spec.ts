import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  metricValue,
  metricUnit,
  displayNumber,
} from "../src/price-cost/format";

import { overviewLabel } from "../src/price-cost/overview-presentation";

const api = "/api/v1/price-cost";

test("real catalogue, overview domains, source evidence and legacy routes", async ({
  page,
  request,
}) => {
  const catalogue = await request.get(api + "/catalogue");
  expect(catalogue.ok()).toBe(true);
  expect((await catalogue.json()).coverage.length).toBeGreaterThan(100);
  await page.goto("/");
  await page
    .getByRole("link", { name: "Open the workspace", exact: true })
    .click();
  await expect(page.locator(".pc-value")).toBeVisible();
  for (const [domain, button, query] of [
    [
      "fuel",
      "Fuel prices",
      "countries=DE&product=automotive_diesel&tax_basis=with_tax",
    ],
    [
      "inflation",
      "Consumer inflation",
      "countries=DE&category=TOTAL&measurement=annual_rate",
    ],
    ["exchange-rates", "Exchange rates", "currencies=GBP"],
  ]) {
    const response = await request.get(`${api}/${domain}/latest?${query}`);
    const metric = (await response.json()).items[0];
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.locator(".pc-overview-metric h2")).toHaveText(
      overviewLabel(metric),
    );
    await expect(page.locator(".pc-value")).toContainText(metricValue(metric));
    await expect(page.locator(".pc-value")).toContainText(
      metric.unit === "percent" ? "%" : metricUnit(metric),
    );
    await page.getByRole("button", { name: "Inspect source evidence" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Exact values", { exact: true }),
    ).toBeVisible();
    await dialog.getByText("Exact values", { exact: true }).click();
    await expect(dialog).toContainText(metric.value);
    if (domain === "fuel")
      await page.screenshot({
        path: "test-results-live/live-evidence-1440.png",
      });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Inspect source evidence" }),
    ).toBeFocused();
  }
  await page.getByRole("button", { name: "Fuel prices", exact: true }).click();
  await page.getByLabel("Country", { exact: true }).selectOption("FR");
  await expect(page.locator(".pc-overview-metric")).toContainText("France");
  await page.getByLabel("Country", { exact: true }).selectOption("DE");
  await page.goBack();
  await expect(page.getByLabel("Country", { exact: true })).toHaveValue("FR");
  await page.goForward();
  await expect(page.getByLabel("Country", { exact: true })).toHaveValue("DE");
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: /Retail signals/ }),
  ).toBeVisible();
});

test("real fuel filters, common period, table and URL restoration", async ({
  page,
}) => {
  await page.goto("/app/explore?country=DE&domain=fuel");
  await expect(page.locator(".pc-value")).toBeVisible();
  await page
    .getByLabel("Fuel product", { exact: true })
    .selectOption("euro_super_95");
  await page
    .getByLabel("Tax basis", { exact: true })
    .selectOption("without_tax");
  await expect(page).toHaveURL(/tax_basis=without_tax/);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Compare countries" }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("FR");
  await page.getByRole("button", { name: "Apply country comparison" }).click();
  await expect(page.getByRole("table")).toContainText("France");
  await expect(
    page.getByRole("heading", { name: "Fuel prices over time" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("table")).toContainText("France");
  await page.goBack();
  await page.goForward();
  await expect(page.getByRole("table")).toBeVisible();
});

test("real HICP measurement/category and ECB derived inverse", async ({
  page,
  request,
}) => {
  await page.goto("/app/explore?domain=inflation&country=DE");
  await expect(page.locator(".pc-value")).toBeVisible();
  await page
    .getByLabel("Consumer category", { exact: true })
    .selectOption("CP01");
  await page
    .getByLabel("Measurement", { exact: true })
    .selectOption("monthly_rate");
  await expect(page.locator(".pc-metric h2")).toContainText("Monthly");
  await page.getByLabel("Measurement", { exact: true }).selectOption("index");
  await expect(
    page.getByRole("button", { name: "Compare countries" }),
  ).toHaveCount(0);
  await expect(page.locator(".pc-value")).toContainText("2025");
  await page
    .getByRole("button", { name: "Exchange rates", exact: true })
    .click();
  await page.getByRole("button", { name: "3 months", exact: true }).click();
  await page.getByLabel("Show derived inverse").click();
  await expect(page.getByLabel("Show derived inverse")).toBeChecked();
  const latest = await request.get(
    api + "/exchange-rates/latest?currencies=GBP&inverse=true",
  );
  const metric = (await latest.json()).items[0];
  await expect(
    page.getByRole("heading", { name: "1 GBP in EUR · derived inverse" }),
  ).toBeVisible();
  await expect(page.locator(".pc-value")).toContainText(
    displayNumber(metric.inverse_rate, metric.inverse_unit),
  );
  await expect(page.locator(".pc-value")).toContainText("EUR/GBP");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("EUR/GBP");
});

test("live page screenshots, responsive navigation, accessibility and no overflow", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, path] of [
      ["landing", "/"],
      ["overview", "/app/overview"],
      ["explore", "/app/explore"],
      ["analyst", "/app/analyst"],
      ["sources", "/app/sources"],
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (name === "overview" || name === "explore")
        await expect(page.locator(".pc-value")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name}:${width}`,
      ).toBe(true);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(audit.violations, `${name}:${width}`).toEqual([]);
      if (width !== 768)
        await page.screenshot({
          path: `test-results-live/live-${name}-${width}.png`,
          fullPage: true,
        });
    }
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Explore", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/explore/);
  expect(errors).toEqual([]);
});

test("live analyst submission, provider response and model-free result restoration", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_LIVE_AI !== "1",
    "Set RUN_LIVE_AI=1 to permit a real provider request",
  );
  test.setTimeout(360000);
  const history = await request.get(api + "/analyst/history?limit=20");
  const saved = (await history.json()).find(
    (item: { status: string }) => item.status === "success",
  );
  expect(saved, "A successful live-provider snapshot must exist").toBeTruthy();
  await page.goto("/app/analyst");
  await expect(page.locator("#pc-answer")).toHaveCount(0);
  await page
    .getByLabel("Your price or cost question")
    .fill("What is the latest EUR to GBP reference exchange rate?");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/analyst/query") &&
      response.request().method() === "POST",
    { timeout: 330000 },
  );
  await page.getByRole("button", { name: "Analyze question" }).click();
  const response = await responsePromise;
  if (response.status() === 429)
    await expect(page.getByRole("alert")).toContainText("too many requests");
  else {
    expect(response.ok()).toBe(true);
    await expect(page.locator("#pc-answer")).toBeVisible();
  }
  let modelCalls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/analyst/query") && r.method() === "POST")
      modelCalls++;
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("button", { name: "Recent analyses" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: new RegExp(saved.question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .first()
      .click();
    await expect(page.locator("#pc-answer")).toBeVisible();
    await expect(page.getByText(/Saved analysis · assessed/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    if (width === 320) {
      const scroll = page.getByRole("region", {
        name: "Verified analysis table",
      });
      await scroll.focus();
      await scroll.press("ArrowRight");
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
      await scroll.evaluate((element) => {
        element.scrollLeft = 0;
      });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results-live/live-analyst-result-${width}.png`,
      fullPage: true,
    });
  }
  expect(modelCalls).toBe(0);
  await page.locator(".pc-followups button").first().click();
  await expect(page.getByLabel("Your price or cost question")).not.toHaveValue(
    saved.question,
  );
  expect(modelCalls).toBe(0);
});
