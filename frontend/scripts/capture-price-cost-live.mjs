/** Read-only diagnostic: render the new frontend against the EXISTING Docker API proxy.
 * It changes only browser transport routing, not services, configuration, schemas or data.
 * Start the new frontend on 4173 first. There are no data fixtures or model requests.
 */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const responses = [];
try {
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    const original = new URL(route.request().url());
    const response = await page.request.get('http://127.0.0.1:5173' + original.pathname + original.search);
    responses.push({ path: original.pathname, status: response.status() });
    await route.fulfill({ response });
  });
  await page.goto('http://127.0.0.1:4173/app/overview');
  await page.getByRole('alert').waitFor();
  await page.evaluate(() => {
    const label = document.createElement('p');
    label.textContent = 'Live deployment diagnostic · existing backend responses · no fixture data';
    label.style.cssText = 'color:#DBF2FC;background:#05274D;padding:8px 18px;margin:0;font:12px/1.6 InterVariable,Inter,sans-serif;text-align:center';
    document.querySelector('.pc-header')?.after(label);
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: '../docs/screenshots/price-cost/live-backend-unavailable-desktop.png', fullPage: true });
  await writeFile('../docs/screenshots/price-cost/live-status.json', JSON.stringify({ note: 'New frontend; GET requests forwarded through existing Docker /api proxy. No data or model fixtures.', responses }, null, 2) + '\n');
  console.log(responses);
} finally { await browser.close(); }
