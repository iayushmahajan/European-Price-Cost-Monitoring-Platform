import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse } from "../src/test/price-cost-fixtures";
for (const width of [1440, 390, 320]) {
  test(`matched fuel history and grounded insights at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/price-cost/**", (route) =>
      route.fulfill({ json: fixtureResponse(route.request().url()) }),
    );
    await page.goto("/app/explore?domain=fuel&country=DE&compare=FR");
    await expect(
      page.getByRole("heading", { name: "Fuel prices over time" }),
    ).toBeVisible();
    await expect(
      page.locator(".pc-fuel-comparison .recharts-line"),
    ).toHaveCount(2);
    await expect(
      page.getByText("4 matched weeks available", { exact: false }),
    ).toBeVisible();
    await page.getByText("Period calculations", { exact: true }).click();
    await expect(page.getByText(/The absolute price gap/)).toContainText(
      "unchanged",
    );
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const table = page.getByRole("region", {
      name: "Matched weekly fuel prices",
    });
    await expect(table.locator("tbody tr")).toHaveCount(4);
    await expect(table).not.toContainText("backend-calculated");
    await table.getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toContainText("Source evidence");
    await page.keyboard.press("Escape");
    await page.goto("/app/overview?domain=fuel");
    const open = page.getByRole("button", {
      name: "Read this number",
      exact: true,
    });
    await open.click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("heading", { name: "How a 50-litre purchase changed" }),
    ).toBeVisible();
    await expect(drawer).toContainText("illustrative purchase");
    await expect(drawer).toContainText("+6.60 EUR");
    const supporting = drawer.getByText("Supporting evidence (4)", {
      exact: true,
    });
    await supporting.focus();
    await page.keyboard.press("Enter");
    await expect(
      drawer.getByRole("button", { name: "Source observation 4" }),
    ).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(await drawer.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
    await page.goto("/app/overview?domain=inflation");
    await page
      .getByRole("button", { name: "Read this number", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("year earlier");
    await expect(page.getByRole("dialog")).toContainText("EU-27");
    await page.keyboard.press("Escape");
    await page.goto("/app/overview?domain=exchange-rates");
    await page
      .getByRole("button", { name: "Read this number", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "What changed for 100 EUR",
    );
    await expect(page.getByRole("dialog")).toContainText(
      "not guaranteed quotes",
    );
  });
}
