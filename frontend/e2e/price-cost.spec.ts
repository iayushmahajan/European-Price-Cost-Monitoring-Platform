import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse, pcFixture } from "../src/test/price-cost-fixtures";

async function fixtures(page: Page) {
  await page.route("**/api/v1/price-cost/**", async (route) => {
    try {
      await route.fulfill({ json: fixtureResponse(route.request().url()) });
    } catch {
      await route.fulfill({
        status: 404,
        json: { detail: "No deterministic fixture for this selection" },
      });
    }
  });
}
async function submit(page: Page, q = pcFixture.analysis.question) {
  await page.getByLabel("Your price or cost question").fill(q);
  await page.getByRole("button", { name: "Analyze question" }).click();
}
async function capture(page: Page, name: string, viewport = false) {
  await page.evaluate(() => {
    if (document.querySelector(".pc-fixture-label")) return;
    const banner = document.createElement("p");
    banner.className = "pc-fixture-label";
    banner.textContent =
      "Contract fixture · illustrative observations, not live official data";
    banner.style.cssText =
      "color:#DBF2FC;background:#05274D;padding:8px 18px;margin:0;font:12px/1.6 InterVariable,Inter,sans-serif;text-align:center";
    document.querySelector(".pc-header")?.after(banner);
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `../docs/screenshots/price-cost/fixture-${name}.png`,
    fullPage: !viewport,
  });
}
test.beforeEach(async ({ page }) => {
  await fixtures(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("landing, direct routes, country URL state, Back/Forward and product/tax selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Everyday prices/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open the workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/overview/);
  await expect(
    page.getByText("€2.282", { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel("Country", { exact: true }).selectOption("FR");
  await expect(page).toHaveURL(/country=FR/);
  await expect(page.locator(".pc-value")).toContainText("2.162");
  await page.goBack();
  await expect(page.locator(".pc-value")).toContainText("2.282");
  await page.goForward();
  await expect(page.locator(".pc-value")).toContainText("2.162");
  await page.goto("/app/explore?country=DE&domain=fuel");
  await page
    .getByLabel("Fuel product", { exact: true })
    .selectOption("euro_super_95");
  await expect(page.locator(".pc-value")).toContainText("2.128");
  await page.getByLabel("Tax basis").selectOption("without_tax");
  await expect(page.locator(".pc-value")).toContainText("1.277");
  await page.reload();
  await expect(page.locator(".pc-value")).toContainText("1.277");
});
test("common-period country comparison, meaningful removal and observation revisions", async ({
  page,
}) => {
  await page.goto("/app/explore");
  await page.getByRole("button", { name: "Compare countries" }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("FR");
  await page.getByRole("button", { name: "Apply country comparison" }).click();
  await expect(
    page.getByRole("heading", { name: "Same-period country comparison" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("-0.120");
  await expect(page.getByRole("table")).toContainText("France");
  await page
    .getByRole("button", { name: "Inspect observation" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Source evidence" }),
  ).toBeVisible();
  await dialog.getByText(/Revisions \(/).click();
  await expect(dialog.getByText(/Detected/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inspect observation" }).first(),
  ).toBeFocused();
  await page.getByRole("button", { name: "Remove France comparison" }).click();
  await expect(
    page.getByRole("heading", { name: "Same-period country comparison" }),
  ).not.toBeVisible();
});
test("HICP rates, estimated flags, index restrictions and EUR derived inverse semantics", async ({
  page,
}) => {
  await page.goto(
    "/app/explore?domain=inflation&start=2026-05-01&end=2026-11-01",
  );
  await expect(page.locator(".pc-value")).toContainText("2.8%");
  await expect(page.locator(".pc-change")).toContainText("percentage points");
  await expect(
    page.getByText("Estimated", { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("Measurement", { exact: true }).selectOption("index");
  await expect(page.locator(".pc-value")).toContainText("103.8");
  await expect(
    page.getByRole("button", { name: "Compare countries" }),
  ).toHaveCount(0);
  await expect(page.getByText(/not comparable basket costs/)).toBeVisible();
  await page.goto(
    "/app/explore?domain=exchange-rates&inverse=true&start=2026-10-01&end=2026-11-08&view=table",
  );
  await expect(page.locator(".pc-value")).toContainText("0.83358");
  await expect(page.locator(".pc-inverse")).toContainText("1.199645");
  await expect(page.getByText(/Official direction:/)).toContainText("1 EUR");
  await expect(page.getByRole("table")).toContainText("EUR/GBP");
  await expect(page.getByRole("table")).not.toContainText("31 Oct 2026");
  await expect(page.getByRole("table")).not.toContainText("1 Nov 2026");
});
test("missing data, partial/stale sources and irregular observations stay explicit", async ({
  page,
}) => {
  await page.route("**/api/v1/price-cost/fuel/history?**", async (route) => {
    const data = structuredClone(
      pcFixture.histories["fuel:DE:automotive_diesel:with_tax"],
    );
    data.items[2].comparison.consecutive = false;
    data.items[2].comparison.elapsed_days = 14;
    data.items[2].status.provisional = true;
    await route.fulfill({ json: data });
  });
  await page.route("**/api/v1/price-cost/fuel/latest?**", async (route) => {
    const data = structuredClone(
      pcFixture.histories["fuel:DE:automotive_diesel:with_tax"],
    );
    data.items = data.items.slice(-1);
    data.sources[0].synchronization_status = "failed";
    data.sources[0].observation_freshness = "stale";
    await route.fulfill({ json: data });
  });
  await page.goto("/app/explore?view=table");
  await expect(page.getByText(/Nonconsecutive observations/)).toBeVisible();
  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(page.getByText(/Observation freshness: stale/)).toContainText(
    "Synchronization: failed",
  );
  await page.route("**/api/v1/price-cost/fuel/latest?**", (route) =>
    route.fulfill({
      json: {
        ...pcFixture.histories["fuel:DE:automotive_diesel:with_tax"],
        available: false,
        items: [],
        missing_selections: ["DE:automotive_diesel:with_tax"],
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No observations available" }),
  ).toBeVisible();
  await expect(page.locator(".pc-value")).toHaveCount(0);
});
test("source health and captured evidence distinguish periods and synchronization", async ({
  page,
}) => {
  const source = {
    ...pcFixture.sources[0],
    synchronization_status: "failed",
    observation_freshness: "current",
  };
  await page.route("**/api/v1/price-cost/sources", (route) =>
    route.fulfill({ json: [source] }),
  );
  await page.goto("/app/sources");
  const row = page.getByRole("button", { name: /European Commission/ });
  await expect(row).toContainText("current");
  await expect(row).toContainText("failed");
  await row.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Last successful sync")).toBeVisible();
  await expect(dialog.getByText("Artifact publication date")).toBeVisible();
  await dialog.getByText("Data quality indicators").click();
  await expect(dialog.getByText("Not reported").first()).toBeVisible();
});
test("analyst success, real clarification payload, failure and model-free history restoration", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/v1/price-cost/analyst/query", async (route) => {
    calls++;
    const payload = route.request().postDataJSON();
    if (calls === 1)
      return route.fulfill({
        json: {
          ...pcFixture.analysis,
          status: "needs_clarification",
          question: payload.question,
          answer: "",
          findings: [],
          evidence: [],
          verified_data: null,
          table: { rows: [], columns: [] },
          clarification: [],
          clarification_question: "Which countries should be compared?",
        },
      });
    if (calls === 2) {
      expect(payload.question).toBe("Compare fuel prices");
      expect(payload.clarification).toEqual([
        {
          question: "Which countries should be compared?",
          answer: "Germany and France, diesel including taxes",
        },
      ]);
      return route.fulfill({ json: pcFixture.analysis });
    }
    return route.fulfill({
      status: 504,
      json: { error: { message: "Provider timed out" } },
    });
  });
  await page.goto("/app/analyst");
  await expect(
    page.getByText(/No answer has been generated yet/),
  ).toBeVisible();
  await submit(page, "Compare fuel prices");
  await page
    .getByLabel("Your clarification")
    .fill("Germany and France, diesel including taxes");
  await page.getByRole("button", { name: "Continue analysis" }).click();
  await expect(
    page.getByRole("heading", { name: pcFixture.analysis.answer }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze question" }).click();
  await expect(page.getByRole("alert")).toContainText("timed out");
  await expect(
    page.getByRole("heading", { name: pcFixture.analysis.answer }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Recent analyses" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Compare diesel/ })
    .click();
  await expect(
    page.getByRole("heading", { name: pcFixture.analysis.answer }),
  ).toBeVisible();
  expect(calls).toBe(3);
  await expect(page.getByText(/Saved analysis · assessed/)).toBeVisible();
});
test("browser race ignores superseded countries and pagination preserves current selection", async ({
  page,
}) => {
  await page.route("**/api/v1/price-cost/fuel/latest?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("countries") === "DE")
      await new Promise((r) => setTimeout(r, 350));
    await route
      .fulfill({ json: fixtureResponse(route.request().url()) })
      .catch(() => {});
  });
  await page.goto("/app/explore");
  await page.getByLabel("Country", { exact: true }).selectOption("FR");
  await expect(page.locator(".pc-value")).toContainText("2.162");
  await page.waitForTimeout(400);
  await expect(page.locator(".pc-value")).toContainText("2.162");
  await page.route("**/api/v1/price-cost/fuel/history?**", async (route) => {
    const data = structuredClone(
      pcFixture.histories["fuel:DE:automotive_diesel:with_tax"],
    );
    const next =
      new URL(route.request().url()).searchParams.get("start") === "2026-10-20";
    data.items = next ? data.items.slice(2) : data.items.slice(0, 2);
    data.page = {
      has_more: !next,
      next_start: next ? null : "2026-10-20",
      limit: 2,
    };
    await route.fulfill({ json: data });
  });
  await page.goto("/app/explore?view=table");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Load more observations" }).click();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Load more observations" }),
  ).not.toBeVisible();
});
test("real frontend screenshots, keyboard dialogs, responsive shell, contrast and reduced motion", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [path, name] of [
    ["/", "landing"],
    ["/app/overview", "overview"],
    ["/app/explore", "explore"],
    ["/app/analyst", "analyst-empty"],
    ["/app/sources", "sources"],
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await capture(page, name + "-desktop");
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations,
      `${path}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
    ).toEqual([]);
  }
  await page.goto("/app/analyst");
  await submit(page);
  await expect(
    page.getByRole("heading", { name: pcFixture.analysis.answer }),
  ).toBeVisible();
  await capture(page, "analyst-result-desktop");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.goto("/app/explore");
  await page.getByRole("button", { name: "Inspect source evidence" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, "evidence-desktop", true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Inspect source evidence" }),
  ).toBeFocused();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, name] of [
      ["/", "landing"],
      ["/app/overview", "overview"],
      ["/app/explore", "explore"],
      ["/app/analyst", "analyst"],
      ["/app/sources", "sources"],
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path === "/app/analyst") {
        await submit(page);
        await expect(
          page.getByRole("heading", { name: pcFixture.analysis.answer }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
      if (width !== 768) await capture(page, `${name}-mobile-${width}`);
      if (width === 320 || width === 390) {
        const r = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          r.violations,
          `${path} ${width}: ${JSON.stringify(r.violations.map((v) => v.id))}`,
        ).toEqual([]);
      }
    }
  }
  await page.goto("/app/overview");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Explore", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/explore/);
  await expect(page.getByLabel("Fuel product")).toBeVisible();
  expect(
    await page
      .locator(".pc-button")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  expect(errors).toEqual([]);
});
