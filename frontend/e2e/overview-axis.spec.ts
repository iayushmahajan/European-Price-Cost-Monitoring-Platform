import { expect, test } from "@playwright/test";
import { fixtureResponse } from "../src/test/price-cost-fixtures";

for (const width of [1440, 390, 320]) {
  test(`Overview axis labels remain separated and tooltips work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/price-cost/**", (route) =>
      route.fulfill({ json: fixtureResponse(route.request().url()) }),
    );
    for (const [domain, measurement, title] of [
      ["fuel", "", "Diesel prices · 12 Oct–2 Nov 2026"],
      ["inflation", "annual_rate", "Annual inflation rate · May–Oct 2026"],
      ["inflation", "monthly_rate", "Monthly inflation rate · May–Oct 2026"],
      ["inflation", "index", "HICP index · May–Oct 2026"],
      ["exchange-rates", "", "Euro to GBP reference rate · 30 Oct–3 Nov 2026"],
    ]) {
      await page.goto(
        `/app/overview?domain=${domain}&measurement=${measurement}`,
      );
      const chart = page.locator(".pc-overview-trend .pc-chart");
      await expect(chart.locator(".recharts-line-curve")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      const note = page.locator(".pc-overview-trend .pc-history-description");
      if (domain === "inflation") {
        await expect(note).toHaveCount(1);
        await expect(note).toContainText(
          measurement === "annual_rate"
            ? "same month one year earlier"
            : measurement === "monthly_rate"
              ? "preceding month"
              : "not percentage changes",
        );
      }
      await expect(chart.locator("figcaption")).toHaveText(
        domain === "fuel"
          ? "EUR/L"
          : domain === "inflation"
            ? measurement === "index"
              ? "index points"
              : "%"
            : "GBP/EUR",
      );
      const geometry = await chart.evaluate((el) => {
        const labels = (axis: string) =>
          [
            ...el.querySelectorAll(
              `.recharts-${axis}Axis-tick-labels .recharts-cartesian-axis-tick-value`,
            ),
          ].map((e) => {
            const b = e.getBoundingClientRect();
            return {
              text: e.textContent!,
              x: b.x,
              right: b.right,
              top: b.top,
              bottom: b.bottom,
            };
          });
        const x = labels("x").sort((a, b) => a.x - b.x);
        const y = labels("y").sort((a, b) => b.top - a.top);
        const bounds = el.getBoundingClientRect();
        return { x, y, left: bounds.left, right: bounds.right };
      });
      expect(geometry.x.length).toBeGreaterThanOrEqual(2);
      expect(geometry.x[0].top - geometry.y[0].bottom).toBeGreaterThanOrEqual(
        12,
      );
      for (let i = 1; i < geometry.x.length; i++) {
        expect(
          geometry.x[i].x - geometry.x[i - 1].right,
        ).toBeGreaterThanOrEqual(12);
      }
      for (const label of [...geometry.x, ...geometry.y]) {
        expect(label.x).toBeGreaterThanOrEqual(geometry.left);
        expect(label.right).toBeLessThanOrEqual(geometry.right);
      }
      expect(
        geometry.y.every((label) => /[0-9]+\.[0-9]{2,}/.test(label.text)),
      ).toBe(true);
      await chart.locator(".recharts-line-dots circle").last().hover();
      await expect(chart.locator(".pc-chart-tooltip")).toBeVisible();
      await expect(chart.locator(".pc-chart-tooltip strong")).toContainText(
        domain === "fuel"
          ? "EUR/L"
          : domain === "inflation"
            ? measurement === "index"
              ? "index points"
              : "%"
            : "GBP/EUR",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}
