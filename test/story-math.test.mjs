import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import loadLcmsFromDb from '../lib/load-from-sql.mjs';
import {
  churchChangePct,
  districtHeadlineVsHistory,
  evaluateStoryMath,
  histBuckets,
  idx100,
  medianByYear,
  roll3,
  shareOver,
  shareUnder,
  scopedChurches,
  yoyPct
} from '../lib/story-math.mjs';
import { DB_PATH, requireDb } from './helpers.mjs';

describe('story series helpers', () => {
  it('indexes, yoy, and rolling averages the way the story charts do', () => {
    assert.deepEqual(idx100([200, 100, 300]), [100, 50, 150]);
    assert.deepEqual(idx100([0, 10]), [null, null]);
    assert.deepEqual(yoyPct([100, 110, 99]), [null, 10, -10]);
    assert.deepEqual(roll3([1, 2, 3, 4]), [1, 2, 2, 3]);
  });

  it('medians ignore zeros and buckets church-level change', () => {
    const churches = [
      { history: { years: [2023, 2024], attendance: [10, 20] } },
      { history: { years: [2023, 2024], attendance: [30, 0] } },
      { history: { years: [2023, 2024], attendance: [50, 40] } }
    ];
    assert.deepEqual(medianByYear(churches, [2023, 2024], 'attendance'), [30, 30]);
    assert.equal(shareUnder(churches, 'attendance', 50, 2023), 66.7);
    assert.equal(shareOver(churches, 'attendance', 50, 2023), 33.3);
    const changes = churchChangePct(churches, [2023, 2024], 'attendance');
    assert.equal(changes.length, 3);
    const buckets = histBuckets(changes);
    assert.equal(buckets.counts.reduce((a, b) => a + b, 0), 3);
  });
});

describe('browser story copy', () => {
  it('keeps median/share/bucket rules aligned with lib/story-math.mjs', async () => {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const browser = await readFile(join(root, 'js/story-charts.js'), 'utf8');
    const lib = await readFile(join(root, 'lib/story-math.mjs'), 'utf8');
    for (const needle of [
      "filter(v => v != null && v > 0)",
      "'< −30%'",
      'window.__lcmsErrors'
    ]) {
      assert.match(browser, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(lib, /filter\(v => v != null && v > 0\)/);
    assert.match(lib, /< −30%/);
  });
});

describe('story math on the snapshot', () => {
  it('runs national and Texas aggregations without throwing', () => {
    requireDb();
    const LCMS = loadLcmsFromDb(DB_PATH);
    const { errors } = evaluateStoryMath(LCMS);
    assert.deepEqual(errors, []);
    const years = LCMS.yearly.years;
    const last = years.at(-1);
    const texas = scopedChurches(LCMS.churches, 'Texas');
    const med = medianByYear(texas, years, 'attendance');
    assert.equal(med.length, years.length);
    assert.ok(med.at(-1) > 0);
    const small = shareUnder(texas, 'attendance', 50, last);
    assert.ok(small >= 0 && small <= 100);
    const d = LCMS.districts.find(x => x.name === 'Texas');
    const vs = districtHeadlineVsHistory(d, LCMS.districtYearly, years);
    assert.equal(vs.comparable, true);
    assert.equal(vs.baptizedMatch, false);
    assert.equal(vs.attendanceMatch, false);
  });
});
