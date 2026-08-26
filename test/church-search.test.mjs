import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { duplicatePlaceKeys, placeKey, searchChurches } from '../lib/church-search.mjs';

const districts = [
  { name: 'Texas' },
  { name: 'Missouri' },
  { name: 'Rocky Mountain' },
  { name: 'California / Nevada / Hawaii' }
];

const churches = [
  { cid: 1, name: 'Trinity Lutheran', city: 'Austin', st: 'TX', zip: '78701', district: 'Texas', att: 120 },
  { cid: 2, name: 'Zion Lutheran', city: 'St. Louis', st: 'MO', zip: '63118', district: 'Missouri', att: 80 },
  { cid: 3, name: 'Hope Lutheran', city: 'Denver', st: 'CO', zip: '80202', district: 'Rocky Mountain', att: 60 },
  { cid: 4, name: 'Our Savior', city: 'Las Vegas', st: 'NV', zip: '89101', district: 'California / Nevada / Hawaii', att: 40 },
  { cid: 5, name: 'Texas Avenue Chapel', city: 'Memphis', st: 'TN', zip: '38103', district: 'Missouri', att: 30 }
];

describe('searchChurches', () => {
  it('matches district names, including two-word districts', () => {
    const texas = searchChurches(churches, 'texas', { districts });
    assert.deepEqual(texas.hits.map(c => c.cid).sort((a, b) => a - b), [1, 5]);
    const rocky = searchChurches(churches, 'rocky mountain', { districts });
    assert.deepEqual(rocky.hits.map(c => c.cid), [3]);
    const california = searchChurches(churches, 'california', { districts });
    assert.deepEqual(california.hits.map(c => c.cid), [4]);
  });

  it('still matches name and city tokens', () => {
    const hits = searchChurches(churches, 'trinity austin', { districts });
    assert.deepEqual(hits.hits.map(c => c.cid), [1]);
    const city = searchChurches(churches, 'st louis', { districts });
    assert.deepEqual(city.hits.map(c => c.cid), [2]);
  });

  it('returns empty under two characters', () => {
    assert.deepEqual(searchChurches(churches, 't', { districts }), { hits: [], total: 0 });
  });
});

describe('duplicatePlaceKeys', () => {
  it('flags churches that share name, city, and state', () => {
    const list = [
      { cid: 1, name: 'Trinity', city: 'Fort Wayne', st: 'IN', zip: '46816' },
      { cid: 2, name: 'Trinity', city: 'Fort Wayne', st: 'IN', zip: '46808' },
      { cid: 3, name: 'Zion', city: 'Chicago', st: 'IL' }
    ];
    const dups = duplicatePlaceKeys(list);
    assert.equal(dups.size, 1);
    assert.equal(dups.has(placeKey(list[0])), true);
    assert.equal(dups.has(placeKey(list[2])), false);
  });

  it('treats case differences as the same place', () => {
    const dups = duplicatePlaceKeys([
      { cid: 1, name: 'Saint John Lutheran Church', city: 'TIGERTON', st: 'WI' },
      { cid: 2, name: 'Saint John Lutheran Church', city: 'Tigerton', st: 'WI' }
    ]);
    assert.equal(dups.size, 1);
  });

  it('ignores records with no name, city, or state', () => {
    assert.equal(duplicatePlaceKeys([
      { cid: 1 },
      { cid: 2 }
    ]).size, 0);
  });
});

describe('browser search copy', () => {
  it('keeps ranking and place-key rules aligned with lib/church-search.mjs', async () => {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const browser = await readFile(join(root, 'js/church-search.js'), 'utf8');
    const lib = await readFile(join(root, 'lib/church-search.mjs'), 'utf8');
    for (const needle of [
      'if (fields.district === tok) return 2',
      'districtWords',
      'duplicatePlaceKeys',
      'if (!name && !city && !st) return \'\''
    ]) {
      assert.match(browser, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(lib, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });
});
