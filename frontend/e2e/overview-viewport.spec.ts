import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse } from "../src/test/price-cost-fixtures";
import type { Overview } from "../src/price-cost/contracts";
for (const domain of ["fuel", "inflation", "exchange-rates"]) {
  test(`Overview ${domain}: collapsed footer fits 900px with real-world status annotations`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/v1/price-cost/**", (route) => {
      const data = structuredClone(fixtureResponse(route.request().url()));
      if (route.request().url().includes("/overview?")) {
        const d = data as Overview;
        d.inflation.sources[0].observation_freshness = "stale";
        d.exchange_rates.sources[0].observation_freshness = "stale";
        d.exchange_rates.sources[0].synchronization_status = "failed";
        d.exchange_rates.items.forEach((m) => {
          m.observation_freshness = "stale";
          m.status.source_status = "A";
        });
      }
      return route.fulfill({ json: data });
    });
    await page.goto(`/app/overview?domain=${domain}`);
    await expect(page.locator(".recharts-line-curve")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(900);
    const footer = await page.locator(".pc-footer").boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(900);
    const canvas = await page.locator(".pc-overview-canvas").boundingBox();
    const sources = await page.locator(".pc-overview-sources").boundingBox();
    expect(
      canvas!.y + canvas!.height - sources!.y - sources!.height,
    ).toBeLessThanOrEqual(17);
    if (domain !== "fuel")
      await expect(
        page.locator(".pc-overview-source-row .pc-notice"),
      ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const toggle = page.getByRole("button", { name: "Source dates & checks" });
    const before = await toggle.evaluate(
      (e) => e.getBoundingClientRect().top + scrollY,
    );
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("region", { name: /Source dates & checks for/ }),
    ).toBeVisible();
    expect(
      await toggle.evaluate((e) => e.getBoundingClientRect().top + scrollY),
    ).toBeCloseTo(before, 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeGreaterThan(900);
    await toggle.click();
    if (domain === "inflation") {
      const index = page.getByText("Inspect matching HICP index months", {
        exact: true,
      });
      await index.click();
      await expect(
        page.getByRole("region", { name: /Matching HICP index months/ }),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Historical observations table" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflowY,
      ),
    ).not.toBe("hidden");
  });
}
