import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse } from "../src/test/price-cost-fixtures";
for (const width of [1440, 390, 320]) {
  test(`Explore filters, disclosures, URL restoration and chart workspace at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/price-cost/**", (route) =>
      route.fulfill({ json: fixtureResponse(route.request().url()) }),
    );
    await page.goto("/app/explore");
    await expect(
      page.getByRole("heading", { name: "Historical observations" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "3 months", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Start date")).not.toBeVisible();
    const custom = page.locator(".pc-explore-custom > summary");
    await custom.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Start date")).toBeVisible();
    await page.getByRole("button", { name: "1 year", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "1 year", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const saved = page.url();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "1 year", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(page.url()).toBe(saved);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Historical observations table" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Consumer inflation", exact: true })
      .click();
    await page.getByLabel("Measurement", { exact: true }).selectOption("index");
    await expect(
      page.getByRole("button", { name: "Compare countries", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Exchange rates", exact: true })
      .click();
    await expect(
      page.getByLabel("Optional comparison on/before"),
    ).not.toBeVisible();
    await page.getByText("Rate comparison date", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel("Optional comparison on/before"),
    ).toBeVisible();
    await page.getByLabel("Show derived inverse").click();
    await expect(page.getByLabel("Show derived inverse")).toBeChecked();
    await expect(
      page.getByRole("heading", { name: "1 GBP in EUR · derived inverse" }),
    ).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
