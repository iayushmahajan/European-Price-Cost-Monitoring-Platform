import { expect, test } from "@playwright/test";
import { fixtureResponse, pcFixture } from "../src/test/price-cost-fixtures";
import type { FuelResponse } from "../src/price-cost/contracts";

for (const width of [1440, 390]) {
  test(`consistent numbers, tiny changes and exact evidence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/v1/price-cost/**", (route) => {
      const result = structuredClone(fixtureResponse(route.request().url()));
      if (route.request().url().includes("/fuel/history")) {
        const point = (result as FuelResponse).items.at(-1)!;
        point.comparison.absolute_change = "-0.000123456789";
      }
      return route.fulfill({ json: result });
    });
    await page.goto("/app/explore?domain=fuel&view=table");
    await expect(page.locator(".pc-value")).toContainText("€2.282");
    await expect(page.locator(".pc-change")).toContainText("−0.000123 EUR/L");
    const table = page.getByRole("region", {
      name: "Historical observations table",
    });
    await expect(table).toContainText("EUR/L");
    await expect(table).not.toContainText("000000000000");
    await page.getByRole("button", { name: /Inspect source evidence/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Exact values");
    await expect(dialog).toContainText("2282.000");
    await page.keyboard.press("Escape");
    await page.goto("/app/explore?domain=inflation&view=table");
    await expect(page.locator(".pc-value")).toContainText("2.80%");
    await expect(page.locator(".pc-change")).toContainText("percentage points");
    await page.goto(
      "/app/explore?domain=exchange-rates&inverse=true&view=table",
    );
    await expect(page.locator(".pc-value")).toContainText("1.200");
    await expect(
      page.getByRole("region", { name: "Historical observations table" }),
    ).toContainText("EUR/GBP");
    await page.goto("/app/analyst");
    await page.getByRole("button", { name: "Recent analyses" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: new RegExp(pcFixture.analysis.question.replace(/[.]/g, "\\.")),
      })
      .click();
    await expect(page.locator("#pc-answer")).toContainText("−0.120 EUR/L");
    await page
      .getByText("Sources, evidence & details", { exact: true })
      .click();
    await page.getByText("Original backend answer", { exact: true }).click();
    await expect(
      page.getByText(pcFixture.analysis.answer, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
