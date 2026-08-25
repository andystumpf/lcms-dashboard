import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveChurchSizes,
  deriveSimilarPeers,
  deriveStateTop20,
  describeSnapshot,
  headlineKpis,
  isFlatSeries,
  periodPctChange,
  scopedKpiSeries,
  snapshotLegendText,
  topN,
  yearBounds
} from '../lib/dashboard-math.mjs';
import { normDistrictName } from '../lib/district-name.mjs';

describe('yearBounds', () => {
  const years = [2015, 2016, 2017, 2018, 2019];

  it('returns the full span when years are omitted', () => {
    assert.deepEqual(yearBounds(years), { startIdx: 0, endIdx: 4 });
  });

  it('returns an empty span for no years', () => {
    assert.deepEqual(yearBounds([]), { startIdx: 0, endIdx: -1 });
  });

  it('swaps inverted start/end', () => {
    assert.deepEqual(yearBounds(years, 2019, 2016), { startIdx: 1, endIdx: 4 });
  });

  it('ignores years that are not in the series', () => {
    assert.deepEqual(yearBounds(years, 1999, 2099), { startIdx: 0, endIdx: 4 });
  });
});

describe('periodPctChange', () => {
  it('returns one decimal of percent change', () => {
    assert.equal(periodPctChange([100, 110]), 10);
    assert.equal(periodPctChange([200, 150]), -25);
  });

  it('returns null for short or null series', () => {
    assert.equal(periodPctChange([]), null);
    assert.equal(periodPctChange([1]), null);
    assert.equal(periodPctChange([null, 10]), null);
  });

  it('treats 0 → 0 as 0 and 0 → n as incomparable', () => {
    assert.equal(periodPctChange([0, 0]), 0);
    assert.equal(periodPctChange([0, 5]), null);
  });

  it('nulls giving when the start sample is a tiny fraction of the end', () => {
    assert.equal(periodPctChange([1, 300], { minComparableRatio: 0.25 }), null);
    assert.equal(periodPctChange([100, 120], { minComparableRatio: 0.25 }), 20);
  });
});

describe('topN', () => {
  const churches = [
    { cid: 2, att: 50 },
    { cid: 1, att: 50 },
    { cid: 3, att: 10 },
    { cid: 4, att: null },
    { cid: 5, att: 0 }
  ];

  it('drops null/zero and breaks ties by cid', () => {
    const top = topN(churches, 'att', 2);
    assert.deepEqual(top.map(c => c.cid), [1, 2]);
  });
});

describe('deriveStateTop20 / deriveChurchSizes', () => {
  it('aggregates states and ignores blank codes', () => {
    const top = deriveStateTop20([
      { st: 'TX', baptized: 10 },
      { st: 'TX', baptized: 5 },
      { st: '', baptized: 99 }
    ]);
    assert.equal(top.length, 1);
    assert.deepEqual(top[0], { state: 'TX', churches: 2, members: 15 });
  });

  it('buckets attendance and ignores missing values', () => {
    const sizes = deriveChurchSizes([
      { att: 10 }, { att: 50 }, { att: 1000 }, { att: null }
    ]);
    assert.equal(sizes[0].count, 1);
    assert.equal(sizes[1].count, 1);
    assert.equal(sizes[5].count, 1);
    assert.equal(sizes.reduce((s, b) => s + b.count, 0), 3);
  });
});

describe('headlineKpis', () => {
  const LCMS = {
    summary: { congregations: 5734, baptizedMembers: 100, avgWeeklyAttendance: 50, totalGivingMillions: null },
    districts: [{ name: 'Texas', churches: 10, baptized: 20, attendance: 8, giving: 1.5 }],
    churches: [
      { district: 'Texas', att: 8, baptized: 20, giving: 1e6 },
      { district: 'Texas', att: null, baptized: null, giving: null },
      { district: 'Michigan', att: 4, baptized: 10, giving: 5e5 }
    ],
    yearly: { congregations: [5650, 5650] }
  };

  it('uses scraped sums vs official, not the history-sample size', () => {
    const { local, official } = headlineKpis(LCMS);
    assert.equal(local.churches, 2);
    assert.equal(official.churches, 5734);
    assert.notEqual(local.churches, LCMS.yearly.congregations[1]);
    assert.equal(local.baptized, 30);
    assert.equal(local.giving, 1.5);
  });

  it('scopes to a district', () => {
    const { local, official } = headlineKpis(LCMS, { district: 'Texas' });
    assert.equal(local.churches, 1);
    assert.equal(official.churches, 10);
    assert.equal(local.baptized, 20);
  });
});

describe('scopedKpiSeries / isFlatSeries', () => {
  it('detects a constant congregation sample series', () => {
    assert.equal(isFlatSeries([5650, 5650, 5650]), true);
    assert.equal(isFlatSeries([100, 90]), false);
  });

  it('scales national series by district share', () => {
    const LCMS = {
      yearly: {
        years: [2023, 2024],
        congregations: [100, 100],
        baptizedMembers: [1000, 900],
        avgWeeklyAttendance: [400, 360],
        totalGivingMillions: [10, 12]
      },
      districts: [{ name: 'Texas', churches: 25, baptized: 250, attendance: 100, giving: 3 }]
    };
    const s = scopedKpiSeries(LCMS, { district: 'Texas', startYear: 2023, endYear: 2024 });
    assert.equal(s.cong[1], 25);
    assert.equal(s.bap[1], 250);
  });
});

describe('deriveSimilarPeers', () => {
  it('averages nearby communing peers and excludes self', () => {
    const churches = [
      { cid: 1, communing: 100, att: 40, baptisms: 2, conf: 1 },
      { cid: 2, communing: 110, att: 60, baptisms: 4, conf: 3 },
      { cid: 3, communing: 105, att: 50, baptisms: 6, conf: 5 },
      { cid: 4, communing: 800, att: 400, baptisms: 20, conf: 10 },
      { cid: 5, communing: 820, att: 420, baptisms: 22, conf: 12 },
      { cid: 6, communing: 810, att: 410, baptisms: 18, conf: 8 }
    ];
    const peers = deriveSimilarPeers(churches, { minPeers: 2, maxPeers: 10 });
    const a = peers.get(1);
    assert.ok(a);
    assert.equal(a.peerCount, 2);
    assert.equal(a.weeklyAttendance, 55);
    assert.equal(a.confirmations, 4);
  });

  it('skips churches without communing membership', () => {
    const peers = deriveSimilarPeers([
      { cid: 1, communing: null, att: 10 },
      { cid: 2, communing: 0, att: 10 }
    ]);
    assert.equal(peers.size, 0);
  });
});

describe('describeSnapshot', () => {
  it('names the modal headline year and history span', () => {
    const snap = describeSnapshot({
      fetchedAt: '2026-05-28T16:02:07.327Z',
      summary: { congregations: 5734 },
      yearly: { years: [2015, 2024] },
      churches: [
        { lastStatYear: 2025, history: { years: [2024] } },
        { lastStatYear: 2025, history: { years: [2024] } },
        { lastStatYear: 2024, history: null }
      ]
    });
    assert.equal(snap.headlineYear, 2025);
    assert.equal(snap.historyStart, 2015);
    assert.equal(snap.historyEnd, 2024);
    assert.equal(snap.withHistory, 2);
    assert.match(snapshotLegendText(snap), /2025/);
    assert.match(snapshotLegendText(snap), /2015–2024/);
  });
});

describe('normDistrictName', () => {
  it('strips a trailing District suffix and collapses whitespace', () => {
    assert.equal(normDistrictName('Texas District'), 'Texas');
    assert.equal(normDistrictName('California / Nevada / Hawaii District'), 'California / Nevada / Hawaii');
    assert.equal(normDistrictName('  Missouri   District  '), 'Missouri');
  });
});
