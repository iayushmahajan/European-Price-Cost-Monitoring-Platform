import { analystAnswer } from "../src/price-cost/analyst-presentation";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtureResponse, pcFixture } from "../src/test/price-cost-fixtures";

async function audit(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/price-cost/**", (route) =>
    route.fulfill({ json: fixtureResponse(route.request().url()) }),
  );
});
for (const width of [1440, 390, 320]) {
  test(`Analyst readable result, raw evidence, follow-up and keyboard focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let queries = 0;
    await page.route("**/analyst/query", (route) => {
      queries++;
      return route.fulfill({ json: pcFixture.analysis });
    });
    await page.goto("/app/analyst");
    await expect(page.getByText("Try a question")).toBeVisible();
    await expect(page.locator(".pc-analyst-empty")).toHaveCount(0);
    await audit(page);
    await page
      .getByLabel("Your price or cost question")
      .fill(pcFixture.analysis.question);
    await page.getByLabel("Your price or cost question").press("Control+Enter");
    await expect(page.locator("#pc-answer")).toHaveText(
      analystAnswer(pcFixture.analysis),
    );
    await expect(page.locator("#pc-answer")).toBeFocused();
    await expect(page.getByText("Try a question")).toHaveCount(0);
    await expect(page.getByRole("definition").first()).toBeVisible();
    await audit(page);
    await page
      .getByRole("group", { name: "Analysis presentation" })
      .getByRole("button", { name: "Table" })
      .click();
    const reader = page.getByRole("region", {
      name: "Verified analysis table",
    });
    await expect(reader).toContainText("Difference from Germany");
    await expect(reader).not.toContainText("Series id");
    await expect(reader).not.toContainText("Source status");
    await page
      .getByText("Sources, evidence & details", { exact: true })
      .click();
    await page
      .getByText("Full data & source precision", { exact: true })
      .click();
    const raw = page.getByRole("region", { name: "Full analysis data" });
    await expect(raw).toContainText("Source status");
    await raw.focus();
    await raw.press("ArrowRight");
    await expect
      .poll(() => raw.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await audit(page);
    await page
      .getByRole("button", { name: pcFixture.analysis.follow_up_questions[0] })
      .click();
    await expect(page.getByLabel("Your price or cost question")).toHaveValue(
      pcFixture.analysis.follow_up_questions[0],
    );
    expect(queries).toBe(1);
    await expect(page.getByLabel("Your price or cost question")).toBeFocused();
    expect(
      await page
        .getByRole("button", { name: "Analyze question" })
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    ).toBe("0s");
  });
}
test("Analyst loading, clarification and unsuccessful states retain accessible recovery", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 320, height: 900 });
  let release!: () => void;
  let calls = 0;
  await page.route("**/analyst/query", async (route) => {
    const body = route.request().postDataJSON();
    calls++;
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({
        json: {
          ...pcFixture.analysis,
          status: "needs_clarification",
          question: body.question,
          answer: "",
          findings: [],
          evidence: [],
          verified_data: null,
          table: { columns: [], rows: [] },
          clarification: [],
          clarification_question: "Which countries should be compared?",
        },
      });
    }
    if (calls === 2) {
      expect(body.question).toBe("Compare fuel prices");
      expect(body.clarification[0].answer).toBe("Germany and France");
      return route.fulfill({
        json: {
          ...pcFixture.analysis,
          status: "unavailable",
          answer: "No supported observations for this request.",
          verified_data: null,
        },
      });
    }
    if (calls === 3 || calls === 4)
      return route.fulfill({
        json: {
          ...pcFixture.analysis,
          status: calls === 3 ? "blocked" : "failed",
          answer: "This request cannot be completed.",
          verified_data: null,
        },
      });
    return route.fulfill({
      status: 429,
      json: { detail: "Provider rate limit" },
    });
  });
  await page.goto("/app/analyst");
  await page
    .getByLabel("Your price or cost question")
    .fill("Compare fuel prices");
  await page.getByRole("button", { name: "Analyze question" }).click();
  await expect(
    page.getByRole("heading", { name: "Checking the data…" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel request" }),
  ).toBeEnabled();
  await audit(page);
  release();
  await page.getByLabel("Your clarification").fill("Germany and France");
  await audit(page);
  await page.getByRole("button", { name: "Continue analysis" }).click();
  await expect(
    page.getByRole("heading", { name: "No matching observations" }),
  ).toBeVisible();
  await audit(page);
  for (const heading of [
    "This request is outside the supported scope",
    "Analysis unavailable",
  ]) {
    await page.getByRole("button", { name: "Analyze question" }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await audit(page);
  }
  await page.getByRole("button", { name: "Analyze question" }).click();
  await expect(page.getByRole("alert")).toContainText("too many requests");
  await expect(
    page.getByRole("button", { name: "Retry analysis" }),
  ).toBeEnabled();
  await audit(page);
});

test("provider interpretation failure can be retried without losing scope", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = 0;
  const bodies: unknown[] = [];
  await page.route("**/analyst/query", async (route) => {
    bodies.push(route.request().postDataJSON());
    calls++;
    return calls === 1
      ? route.fulfill({
          status: 502,
          json: {
            error: {
              code: "invalid_model_output",
              message: "private provider details",
            },
          },
        })
      : route.fulfill({ json: pcFixture.analysis });
  });
  await page.goto("/app/analyst");
  await expect(page.getByText(/Ctrl or/)).toHaveCount(0);
  const composer = page.locator(".pc-composer");
  expect(
    await composer.evaluate((e) => getComputedStyle(e).borderTopStyle),
  ).toBe("solid");
  await page
    .getByLabel("Your price or cost question")
    .fill(pcFixture.analysis.question);
  await page.getByRole("button", { name: "Analyze question" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "couldn’t safely interpret",
  );
  await audit(page);
  await page.getByRole("button", { name: "Retry analysis" }).click();
  await expect(page.locator("#pc-answer")).toHaveText(
    analystAnswer(pcFixture.analysis),
  );
  expect(bodies[1]).toEqual(bodies[0]);
  await audit(page);
  await page.getByRole("button", { name: "Clear question" }).click();
  await expect(page.getByLabel("Your price or cost question")).toBeEmpty();
  await expect(page.getByText("Try a question")).toBeVisible();
  expect(calls).toBe(2);
});

test("provider cooldown prevents repeat submissions until Retry-After expires", async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  await page.route("**/analyst/query", (route) => {
    calls++;
    return calls === 1
      ? route.fulfill({
          status: 429,
          headers: { "Retry-After": "3" },
          json: {
            error: {
              code: "provider_rate_limited",
              message: "private provider detail",
            },
          },
        })
      : route.fulfill({ json: pcFixture.analysis });
  });
  await page.goto("/app/analyst");
  await page
    .getByLabel("Your price or cost question")
    .fill(pcFixture.analysis.question);
  await page.getByRole("button", { name: "Analyze question" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily rate-limited",
  );
  await expect(
    page.getByRole("button", { name: "Retry in 3s" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Analyze question" }),
  ).toBeDisabled();
  await page.clock.fastForward(2000);
  await expect(
    page.getByRole("button", { name: "Retry in 1s" }),
  ).toBeDisabled();
  expect(calls).toBe(1);
  await page.clock.fastForward(1000);
  const retry = page.getByRole("button", { name: "Retry analysis" });
  await expect(retry).toBeEnabled();
  expect(calls).toBe(1); // No frontend automatic retry layered over backend backoff.
  await retry.click();
  await expect(page.locator("#pc-answer")).toHaveText(
    analystAnswer(pcFixture.analysis),
  );
  expect(calls).toBe(2);
});
