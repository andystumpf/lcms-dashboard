// Headless-Chrome screenshot capture for the LCMS dashboard docs.
// Drives the locally-running server (http://localhost:8000) via puppeteer-core
// + the system Google Chrome. Run with the server already started:
//
//   npm start &
//   node tools/capture-screenshots.mjs
//
// Output: docs/screenshots/*.png

import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const BASE = process.env.BASE_URL || 'http://localhost:8000';
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Capture a vertical slice of the page from the top of `fromSel` to the
// bottom of `toSel`, full content width.
async function clipBetween(page, file, fromSel, toSel = fromSel, pad = 16) {
  const rect = await page.evaluate(
    (a, b, p) => {
      const top = document.querySelector(a);
      const bot = document.querySelector(b);
      if (!top || !bot) return null;
      const t = top.getBoundingClientRect();
      const bo = bot.getBoundingClientRect();
      const sx = window.scrollX, sy = window.scrollY;
      const y = Math.max(0, t.top + sy - p);
      return {
        x: 0,
        y,
        width: document.documentElement.clientWidth,
        height: bo.bottom + sy - y + p,
      };
    },
    fromSel,
    toSel,
    pad
  );
  if (!rect) {
    console.warn(`  ! selectors not found: ${fromSel} -> ${toSel}`);
    return;
  }
  await page.screenshot({
    path: join(OUT, file),
    clip: rect,
    captureBeyondViewport: true,
  });
  console.log(`  ✓ ${file}  (${Math.round(rect.height)}px tall)`);
}

async function element(page, file, sel, pad = 0) {
  const el = await page.$(sel);
  if (!el) {
    console.warn(`  ! element not found: ${sel}`);
    return;
  }
  await el.screenshot({ path: join(OUT, file) });
  console.log(`  ✓ ${file}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1480, height: 1200, deviceScaleFactor: 2 });

  // ── DASHBOARD ───────────────────────────────────────────────────────────
  console.log('Dashboard (index.html)');
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('kpi-congregations');
      return el && el.textContent.trim() && el.textContent.trim() !== '—';
    },
    { timeout: 30000 }
  );
  await sleep(2500); // let all Chart.js animations settle

  await clipBetween(page, 'dashboard-overview.png', 'header.header', '.kpi-grid');
  await clipBetween(
    page,
    'dashboard-key-indicators.png',
    '.section-title',
    '#districtShareChart',
    24
  );
  await element(page, 'dashboard-top50.png', '.top50-card');

  // National Trends block: membership row through state/member-flow row.
  await clipBetween(
    page,
    'dashboard-national-trends.png',
    '#membershipChart',
    '#memberFlowChart',
    40
  );
  await element(page, 'dashboard-districts.png', '#districtChart');

  // League table (last .chart-card on the page).
  const tableSel = await page.evaluate(() => {
    document
      .querySelectorAll('#districtTableBody')[0]
      .closest('.chart-card')
      .setAttribute('data-shot', 'league');
    return '[data-shot="league"]';
  });
  await element(page, 'dashboard-league-table.png', tableSel);

  // Story charts (sample slice — the section is very tall).
  await page.evaluate(() => {
    const m = document.getElementById('storyChartsMount');
    if (m) m.scrollIntoView();
  });
  await sleep(1500);
  const story = await page.evaluate(() => {
    const m = document.getElementById('storyChartsMount');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { y: r.top + window.scrollY, width: document.documentElement.clientWidth };
  });
  if (story) {
    await page.screenshot({
      path: join(OUT, 'dashboard-story-charts.png'),
      clip: { x: 0, y: story.y, width: story.width, height: 1180 },
      captureBeyondViewport: true,
    });
    console.log('  ✓ dashboard-story-charts.png');
  }

  // Church lookup with a live search + detail panel.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#lookupInput');
  await page.type('#lookupInput', 'concordia san antonio tx', { delay: 25 });
  await page.waitForSelector('#lookupResults .lookup-result', { timeout: 8000 });
  await sleep(400);
  await clipBetween(page, 'dashboard-lookup-results.png', '.lookup-card', '#lookupResults', 12);
  await page.click('#lookupResults .lookup-result');
  await page.waitForSelector('#lookupTrendCanvas', { timeout: 8000 });
  await sleep(2000);
  await element(page, 'dashboard-lookup-detail.png', '#lookupDetail');

  // ── COMPARE ─────────────────────────────────────────────────────────────
  console.log('Compare (compare.html)');
  await page.goto(`${BASE}/compare.html?cids=811311,513013,547977,673386`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForSelector('#compareMetricsTable thead th', { timeout: 30000 });
  await sleep(2500);
  await clipBetween(page, 'compare-overview.png', '.compare-card', '#compareTrend', 16);
  await element(page, 'compare-charts.png', '#compareCharts');

  // ── SQL CONSOLE ─────────────────────────────────────────────────────────
  console.log('SQL console (sql.html)');
  await page.goto(`${BASE}/sql.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#tablesList .table-item-row', { timeout: 30000 });
  await page.evaluate(() => {
    document.getElementById('sqlQuery').value =
      "SELECT name, city, state, attendance, baptized\nFROM churches\nWHERE has_stats = 1\nORDER BY attendance DESC\nLIMIT 15;";
  });
  await page.click('#executeBtn');
  await page.waitForSelector('#resultsContent .results-table', { timeout: 8000 });
  await sleep(800);
  await page.screenshot({
    path: join(OUT, 'sql-console.png'),
    clip: { x: 0, y: 0, width: 1480, height: 980 },
  });
  console.log('  ✓ sql-console.png');

  // Expand a table's columns in the sidebar for a schema-browsing shot.
  await page.click('.table-item-row[data-table="churches"]');
  await sleep(600);
  await element(page, 'sql-schema-sidebar.png', '.sql-sidebar');

  await browser.close();
  console.log('\nDone. Screenshots in docs/screenshots/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
