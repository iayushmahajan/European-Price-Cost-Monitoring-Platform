import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse } from "../src/test/price-cost-fixtures";
for (const width of [1440, 390, 320]) {
  test(`workspace polish, source clarity and natural scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/v1/price-cost/**", (route) =>
      route.fulfill({ json: fixtureResponse(route.request().url()) }),
    );
    for (const path of [
      "/",
      "/app/overview",
      "/app/explore",
      "/app/analyst",
      "/app/sources",
    ]) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (path === "/app/overview" || path === "/app/explore")
        await expect(page.locator(".recharts-line-curve")).toBeVisible();
      if (path === "/app/sources")
        await expect(
          page.getByRole("button", { name: /European Commission/ }),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (width === 1440)
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight),
        ).toBeLessThanOrEqual(902);
    }
    const source = page.getByRole("button", { name: /European Commission/ });
    await expect(source).toContainText("Within expected period");
    await source.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Last successful sync", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Artifact publication date", { exact: true }),
    ).not.toBeVisible();
    await dialog
      .getByText("Publication & check details", { exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      dialog.getByText("Artifact publication date", { exact: true }),
    ).toBeVisible();
    await dialog.getByText("Series coverage", { exact: true }).click();
    const table = dialog.getByRole("table");
    await expect(table).toContainText("Including taxes");
    await expect(table).not.toContainText("with_tax");
    await expect(table).not.toContainText("automotive_diesel");
    expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(source).toBeFocused();
    await page.goto("/app/overview");
    await page.getByRole("button", { name: "Source dates & checks" }).click();
    await expect(
      page.getByRole("region", { name: /Source dates & checks for/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).overflowY,
      ),
    ).not.toBe("hidden");
  });
}
