import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse, pcFixture } from "../src/test/price-cost-fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/price-cost/**", (route) =>
    route.fulfill({ json: fixtureResponse(route.request().url()) }),
  );
});

test("latest page and headline share the selected range, older pages prepend without changing the headline", async ({
  page,
}) => {
  const rows = structuredClone(
    pcFixture.histories["fuel:DE:automotive_diesel:with_tax"],
  );
  const cursors: string[] = [];
  await page.route("**/api/v1/price-cost/fuel/history?**", (route) => {
    const q = new URL(route.request().url()).searchParams;
    expect(q.get("order")).toBe("desc");
    cursors.push(q.get("end")!);
    const older = q.get("end") === "2026-10-19";
    return route.fulfill({
      json: {
        ...rows,
        items: older ? rows.items.slice(0, 2) : rows.items.slice(2),
        page: {
          limit: 2,
          has_more: !older,
          next_start: null,
          previous_end: older ? null : "2026-10-19",
        },
      },
    });
  });
  await page.goto("/app/explore?start=2026-10-01&end=2026-11-02&view=table");
  await expect(page.locator(".pc-value")).toContainText("2.282");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByText(/Selected calendar range:/)).toContainText(
    "Showing 2 available observations",
  );
  await page.getByRole("button", { name: "Load older observations" }).click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(4);
  await expect(
    page.getByRole("table").locator("tbody tr").first(),
  ).toContainText("12 Oct 2026");
  await expect(page.locator(".pc-value")).toContainText("2.282");
  expect([...new Set(cursors)]).toEqual(["2026-11-02", "2026-10-19"]);
});

test("an empty calendar range never falls back to an older headline", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => calls.push(request.url()));
  await page.goto("/app/explore?start=2026-11-03&end=2026-11-10");
  await expect(
    page.getByText(/No observations in the selected date range/),
  ).toBeVisible();
  await expect(page.locator(".pc-value")).toHaveCount(0);
  expect(calls.some((url) => url.includes("/fuel/latest?"))).toBe(false);
});

for (const width of [1440, 390, 320]) {
  test(`selected FX direction and exclusive inflation comparison views at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/app/explore?domain=exchange-rates&inverse=true&start=2026-10-01&end=2026-11-10&view=table",
    );
    await expect(page.locator(".pc-value")).toContainText("1.200");
    await expect(page.locator(".pc-value")).toContainText("EUR/GBP");
    await expect(page.locator(".pc-change")).toContainText("+");
    await expect(page.getByRole("table")).toContainText("EUR/GBP");
    await expect(page.getByRole("table")).not.toContainText("GBP/EUR");
    await page.getByRole("button", { name: "Read this number" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(/The derived direction is 1 GBP in EUR/),
    ).toBeVisible();
    await expect(dialog.getByText(/What changed for 100 GBP/)).toBeVisible();
    await expect(dialog.locator(".pc-context-value")).toContainText("+");
    await dialog.getByRole("button", { name: "Close panel" }).click();
    await page.getByLabel("Show derived inverse").click();
    await expect(page.locator(".pc-value")).toContainText("GBP/EUR");
    await expect(page.locator(".pc-change")).toContainText("−");
    await page.goto(
      "/app/explore?domain=inflation&compare=FR&start=2026-05-01&end=2026-11-01",
    );
    await expect(page.getByText(/Reference:/)).toContainText("Germany");
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("table").locator("tbody tr")).toContainText(
      "France",
    );
    await expect(page.getByRole("table").locator("tbody tr")).toContainText(
      "percentage points",
    );
    await expect(
      page.getByRole("figure", { name: /Same-period comparison/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: /Reference country evidence/ })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: /Reference country evidence/ }),
    ).toBeFocused();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("an older common inflation period cannot escape the selected calendar range", async ({
  page,
}) => {
  await page.goto(
    "/app/explore?domain=inflation&compare=FR&start=2026-11-01&end=2026-11-01",
  );
  await expect(
    page.getByText(
      /No shared observation is available within the selected date range/,
    ),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByText(/Reference:/)).toHaveCount(0);
});
