import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse } from "../src/test/price-cost-fixtures";
import type { Evidence } from "../src/price-cost/contracts";

for (const width of [1440, 390, 320]) {
  test(`monthly inflation semantics and shared evidence disclosures at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let indexRequests = 0;
    await page.route("**/api/v1/price-cost/**", (route) => {
      const url = route.request().url();
      const data = structuredClone(fixtureResponse(url));
      if (
        url.includes("/inflation/history?") &&
        new URL(url).searchParams.get("measurement") === "index"
      )
        indexRequests++;
      if (url.includes("/evidence/inflation/")) {
        const e = data as Evidence;
        e.original_values = {
          ...e.original_values,
          status: "e",
          measurement_type: "annual_rate",
        };
      }
      return route.fulfill({ json: data });
    });
    await page.goto("/app/overview?domain=inflation");
    await expect(
      page.getByRole("heading", {
        name: "Annual inflation rate · May–Oct 2026",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/6 monthly observations available/),
    ).toBeVisible();
    const chart = page.locator(".pc-overview-trend .pc-chart");
    const labels = await chart
      .locator(".recharts-xAxis-tick-labels text")
      .allTextContents();
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels.every((label) => /^[A-Za-z]+ 2026$/.test(label))).toBe(true);
    await chart.locator(".recharts-line-dots circle").last().hover();
    await expect(chart.locator(".pc-chart-tooltip")).toContainText(
      "October 2026",
    );
    expect(indexRequests).toBe(0);
    const summary = page.getByText("Inspect matching HICP index months", {
      exact: true,
    });
    await summary.focus();
    await page.keyboard.press("Enter");
    const pairs = page.getByRole("region", {
      name: "Matching HICP index months",
    });
    await expect(pairs).toBeVisible();
    await expect(pairs).toContainText("2025 index");
    await expect(pairs).toContainText("2026 index");
    await expect(pairs.getByText("Not available")).toHaveCount(6);
    await expect(page.getByText(/no rate is recalculated/)).toBeVisible();
    expect(indexRequests).toBeGreaterThan(0);
    const fetched = indexRequests;
    await summary.click();
    await summary.click();
    expect(indexRequests).toBe(fetched);
    const opener = page.getByRole("button", {
      name: /Inspect source evidence/,
    });
    await opener.click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("heading", { name: "Annual inflation rate" }),
    ).toBeVisible();
    await expect(
      drawer.getByText(
        "Eurostat marks this observation as an estimated value.",
      ),
    ).toBeVisible();
    const exact = drawer.getByText("Exact values", { exact: true });
    await exact.focus();
    await page.keyboard.press("Enter");
    await expect(drawer.locator("pre").first()).toBeVisible();
    const provenance = drawer.getByText("Methodology & provenance", {
      exact: true,
    });
    await provenance.focus();
    await page.keyboard.press("Enter");
    await expect(
      drawer.getByText("Observation publication date"),
    ).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(await drawer.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    await page.getByRole("button", { name: /^Monthly inflation/ }).click();
    await expect(
      page.getByRole("heading", {
        name: "Monthly inflation rate · May–Oct 2026",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/preceding month/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/app/overview?domain=inflation&measurement=index");
    await expect(
      page.getByRole("heading", {
        name: "HICP index · May–Oct 2026",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/not percentage changes/)).toBeVisible();
    await expect(
      page.getByText("Inspect matching HICP index months", { exact: true }),
    ).toHaveCount(0);
    const finalAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(finalAxe.violations).toEqual([]);
  });
}
