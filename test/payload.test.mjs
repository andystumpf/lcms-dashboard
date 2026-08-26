import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import loadLcmsFromDb from '../lib/load-from-sql.mjs';
import { describeHealth, headlineKpis, isFlatSeries, isMemberCongregation, scopedKpiSeries, scaleSeries, topN } from '../lib/dashboard-math.mjs';
import { DB_PATH, requireDb } from './helpers.mjs';

let LCMS;

before(() => {
  requireDb();
  LCMS = loadLcmsFromDb(DB_PATH);
});

describe('LCMS payload contract', () => {
  it('loads a well-formed snapshot', () => {
    assert.ok(Array.isArray(LCMS.churches));
    assert.ok(LCMS.churches.length >= 5000);
    assert.equal(LCMS.districts.length, 35);
    assert.ok(LCMS.summary);
    assert.ok(LCMS.yearly.years.length >= 8);
    assert.ok(LCMS.snapshot);
    assert.equal(LCMS.snapshot.churches, LCMS.churches.length);
    assert.equal(LCMS.snapshot.withHistory, LCMS.churches.filter(c => c.history?.years?.length).length);
  });

  it('does not use the flat history sample as the congregation headline', () => {
    const { local, official } = headlineKpis(LCMS);
    const sample = LCMS.yearly.congregations[LCMS.yearly.congregations.length - 1];
    assert.equal(isFlatSeries(LCMS.yearly.congregations), true);
    assert.equal(official.churches, LCMS.summary.congregations);
    assert.notEqual(local.churches, sample);
    assert.notEqual(official.churches, sample);
  });

  it('attaches similar as a peer-average object, not the unused integer column', () => {
    const withPeers = LCMS.churches.filter(c => c.similar?.peerCount);
    assert.ok(withPeers.length > 1000);
    const sample = withPeers[0].similar;
    assert.equal(typeof sample, 'object');
    assert.equal(typeof sample.peerCount, 'number');
    assert.ok(sample.peerCount >= 2);
    assert.ok('weeklyAttendance' in sample);
    assert.ok('confirmations' in sample);
    assert.notEqual(typeof sample, 'number');
  });

  it('computes per-member giving and confirmations consistently', () => {
    const withGiving = LCMS.churches.find(c => c.giving && c.baptized && c.perMemberGiving);
    assert.ok(withGiving);
    assert.ok(withGiving.perMemberGiving > 0);

    const withConf = LCMS.churches.filter(c => c.conf != null);
    assert.ok(withConf.length > 1000);
    for (const c of withConf.slice(0, 50)) {
      assert.ok(c.conf >= 0);
    }
  });

  it('normalizes district names so churches join the district list', () => {
    const names = new Set(LCMS.districts.map(d => d.name));
    const unknown = LCMS.churches.filter(c => c.district && !names.has(c.district));
    assert.equal(unknown.length, 0);
    for (const name of names) {
      assert.ok(!/district$/i.test(name));
    }
  });

  it('keeps headline year and history end distinct when the snapshot is mixed-year', () => {
    assert.ok(LCMS.snapshot.headlineYear);
    assert.ok(LCMS.snapshot.historyEnd);
    assert.notEqual(LCMS.snapshot.headlineYear, LCMS.snapshot.historyEnd);
  });

  it('exposes district yearly series that match congregation history sums', () => {
    assert.equal(Object.keys(LCMS.districtYearly).length, LCMS.districts.length);
    const years = LCMS.yearly.years;
    const last = years[years.length - 1];
    const yi = years.indexOf(last);
    const name = 'Texas';
    assert.ok(LCMS.districtYearly[name]);
    let expected = 0;
    for (const c of LCMS.churches) {
      if (c.district !== name) continue;
      const i = c.history?.years?.indexOf(last);
      if (i == null || i < 0) continue;
      expected += c.history.baptized[i] ?? 0;
    }
    assert.equal(LCMS.districtYearly[name].baptizedMembers[yi], expected);
    const s = scopedKpiSeries(LCMS, { district: name, startYear: years[0], endYear: last });
    const d = LCMS.districts.find(x => x.name === name);
    const scaledLast = scaleSeries(LCMS.yearly.baptizedMembers, d, 'baptized').at(-1);
    assert.equal(s.bap.at(-1), LCMS.districtYearly[name].baptizedMembers[yi]);
    assert.notEqual(Math.round(scaledLast), s.bap.at(-1));
    assert.equal(s.giv.every(v => v == null), true);
  });

  it('reports health counts that match the assembled snapshot', () => {
    const health = describeHealth(LCMS);
    assert.equal(health.ok, true);
    assert.equal(health.churches, LCMS.churches.length);
    assert.equal(health.districts, LCMS.districts.length);
    assert.equal(health.officialCongregations, LCMS.summary.congregations);
    assert.equal(health.withHistory, LCMS.snapshot.withHistory);
    assert.equal(health.historyEnd, LCMS.snapshot.historyEnd);
    assert.equal(health.headlineYear, LCMS.snapshot.headlineYear);
    assert.equal(health.districtYearly, Object.keys(LCMS.districtYearly).length);
    assert.equal(health.members, LCMS.churches.filter(isMemberCongregation).length);
    assert.ok(health.members < health.churches);
    assert.ok(health.headlineHistoryMismatch > 0);
    const membersTop = topN(LCMS.churches, 'att', 50, 'desc', { membersOnly: true });
    assert.equal(membersTop.length, 50);
    assert.ok(membersTop.every(isMemberCongregation));
  });

  it('documents duplicate places and mismatched giving sources on the snapshot', () => {
    assert.equal(LCMS.snapshot.duplicateNameGroups, 23);
    assert.ok(LCMS.snapshot.givingHeadlineMillions > 1400);
    assert.ok(LCMS.snapshot.givingHistoryMillions > 1200);
    assert.notEqual(
      Math.round(LCMS.snapshot.givingHeadlineMillions),
      Math.round(LCMS.snapshot.givingHistoryMillions)
    );
    assert.match(LCMS.snapshot.legend, /Congregation PDF contributions/);
    const health = describeHealth(LCMS);
    assert.equal(health.duplicateNameGroups, 23);
    assert.equal(health.givingHeadlineMillions, LCMS.snapshot.givingHeadlineMillions);
    assert.equal(health.givingHistoryMillions, LCMS.snapshot.givingHistoryMillions);
    assert.equal(health.storyMathErrors, 0);
  });
});
