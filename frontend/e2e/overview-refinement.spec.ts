import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse } from "../src/test/price-cost-fixtures";

for (const width of [1440, 390, 320]) {
  test(`Overview selection, evidence, readable comparisons and keyboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/v1/price-cost/**", (route) =>
      route.fulfill({ json: fixtureResponse(route.request().url()) }),
    );
    async function audit() {
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
    }
    await page.goto("/app/overview");
    await expect(
      page.getByRole("heading", { name: "Diesel", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Diesel prices · 12 Oct–2 Nov 2026" }),
    ).toBeVisible();
    await expect(page.getByText("Week of 2 Nov 2026").first()).toBeVisible();
    await audit();
    const petrol = page.getByRole("button", { name: /^Petrol \(95\)/ });
    await petrol.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Petrol (95)", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".pc-value")).toContainText("2.128");
    await page.getByRole("button", { name: "Inspect source evidence" }).click();
    await expect(page.getByRole("dialog")).toContainText("Exact values");
    await audit();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Inspect source evidence" }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Consumer inflation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Annual inflation", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".pc-change")).toContainText("percentage points");
    await page.getByRole("button", { name: /^Monthly inflation/ }).click();
    await expect(page.locator(".pc-value")).toContainText("−0.10%");
    await expect(page.getByText(/preceding month/)).toBeVisible();
    await audit();
    await page.getByRole("button", { name: "Table", exact: true }).focus();
    await page.keyboard.press("Enter");
    const table = page.getByRole("region", {
      name: "Historical observations table",
    });
    await expect(table).toBeVisible();
    await expect(table).not.toContainText("Source status:");
    await table.focus();
    await page.keyboard.press("ArrowRight");
    await audit();
    await page
      .getByRole("button", { name: "Exchange rates", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Euro to GBP", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Country", { exact: true })).toHaveCount(0);
    await page.getByLabel("EUR quote").selectOption("USD");
    await expect(
      page.getByRole("heading", { name: "Euro to USD", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Investigate in Explore/ }),
    ).toHaveAttribute("href", /currency=USD/);
    await audit();
  });
}

for (const width of [1440, 390, 320]) {
  test(`source disclosure stays alongside attribution in both states at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/v1/price-cost/**", (route) =>
      route.fulfill({ json: fixtureResponse(route.request().url()) }),
    );
    for (const domain of ["fuel", "inflation", "exchange-rates"]) {
      await page.goto(`/app/overview?domain=${domain}`);
      const toggle = page.getByRole("button", {
        name: "Source dates & checks",
        exact: true,
      });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      const panel = page.getByRole("region", {
        name: /^Source dates & checks for/,
      });
      await expect(panel).toHaveCount(0);
      await toggle.scrollIntoViewIfNeeded();
      const attribution = page.locator(".pc-overview-attribution");
      const before = await toggle.boundingBox();
      const sourceBefore = await attribution.boundingBox();
      const documentTop = await toggle.evaluate(
        (e) => e.getBoundingClientRect().top + window.scrollY,
      );
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(panel).toBeVisible();
      await expect(toggle).toBeFocused();
      const after = await toggle.boundingBox();
      const sourceAfter = await attribution.boundingBox();
      // Document coordinates remain fixed even if the browser anchors its scroll position.
      expect(
        await toggle.evaluate(
          (e) => e.getBoundingClientRect().top + window.scrollY,
        ),
      ).toBeCloseTo(documentTop, 1);
      expect(after!.x).toBeCloseTo(before!.x, 1);
      expect(after!.width).toBeCloseTo(before!.width, 1);
      expect(after!.y - sourceAfter!.y).toBeCloseTo(
        before!.y - sourceBefore!.y,
        1,
      );
      expect(after!.x).toBeGreaterThan(sourceAfter!.x + sourceAfter!.width);
      expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(
        Math.max(
          after!.y + after!.height,
          sourceAfter!.y + sourceAfter!.height,
        ),
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(panel).toHaveCount(0);
      await expect(toggle).toBeFocused();
    }
  });
}
