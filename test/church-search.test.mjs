import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { searchChurches } from '../lib/church-search.mjs';

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
