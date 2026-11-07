import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:5173";
const output = fileURLToPath(new URL("../../docs/screenshots/", import.meta.url));
const routes = [
  ["overview", "/overview"],
  ["explore-markets", "/explore"],
  ["ai-analyst-result", "/analyst"],
  ["data-sources", "/data"],
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await page.emulateMedia({ reducedMotion: "reduce" });

async function settle() {
  await page.waitForLoadState("networkidle");
  await page.locator(".page-state").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  await page.evaluate(async () => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
}

async function restoreComparison() {
  await page.getByRole("button", { name: /Recent analyses/ }).click();
  const comparison = page.getByRole("button", { name: /Compare Germany and the EU-27 over the latest 12 months/ }).first();
  if (await comparison.count()) {
    await comparison.click();
    await page.locator(".analysis-result").waitFor();
    await page.locator(".result-chart .recharts-line-curve").first().waitFor().catch(() => {});
  } else {
    await page.keyboard.press("Escape");
  }
}

async function capture(name, path, mobile = false) {
  await page.goto(`${baseUrl}${path}`);
  await settle();
  if (path === "/analyst") await restoreComparison();
  if (path === "/overview" || path === "/explore") {
    const line = page.locator(".trend-chart .recharts-line-curve").first();
    await line.waitFor();
    const width = await line.evaluate((element) => element.getBBox().width);
    const chartWidth = await page.locator(".trend-chart").evaluate((element) => element.getBoundingClientRect().width);
    if (width < chartWidth * 0.7) throw new Error(`${path} chart rendered only ${Math.round(width)}px of ${Math.round(chartWidth)}px`);
  }
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(50);
  await page.screenshot({ path: `${output}${mobile ? "mobile-" : ""}${name}.png`, fullPage: true });
}

for (const [name, path] of routes) await capture(name, path);
await page.setViewportSize({ width: 390, height: 844 });
for (const [name, path] of routes) await capture(name, path, true);
await browser.close();
