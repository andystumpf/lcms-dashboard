// Shared type-ahead search over LCMS.churches. Used by church lookup and compare views.

(function () {
  const MAX_RESULTS = 200;

  const STATE_NAMES = {
    alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA',
    colorado:'CO', connecticut:'CT', delaware:'DE', florida:'FL', georgia:'GA',
    hawaii:'HI', idaho:'ID', illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS',
    kentucky:'KY', louisiana:'LA', maine:'ME', maryland:'MD', massachusetts:'MA',
    michigan:'MI', minnesota:'MN', mississippi:'MS', missouri:'MO', montana:'MT',
    nebraska:'NE', nevada:'NV', 'new hampshire':'NH', 'new jersey':'NJ',
    'new mexico':'NM', 'new york':'NY', 'north carolina':'NC', 'north dakota':'ND',
    ohio:'OH', oklahoma:'OK', oregon:'OR', pennsylvania:'PA', 'rhode island':'RI',
    'south carolina':'SC', 'south dakota':'SD', tennessee:'TN', texas:'TX',
    utah:'UT', vermont:'VT', virginia:'VA', washington:'WA', 'west virginia':'WV',
    wisconsin:'WI', wyoming:'WY', 'district of columbia':'DC', 'puerto rico':'PR'
  };

  function scoreToken(tok, c, fields) {
    if (!tok) return 0;
    if (String(c.cid) === tok) return 0;
    if (fields.zip && fields.zip.startsWith(tok)) return 1;
    if (tok.length === 2 && fields.st === tok) return 2;
    const fullState = STATE_NAMES[tok];
    if (fullState && fields.st === fullState.toLowerCase()) return 2;
    if (fields.name.startsWith(tok)) return 3;
    if (fields.nameWords.some(w => w.startsWith(tok))) return 4;
    if (fields.city.startsWith(tok)) return 5;
    if (fields.cityWords.some(w => w.startsWith(tok))) return 6;
    if (fields.name.includes(tok)) return 7;
    if (fields.city.includes(tok)) return 8;
    return null;
  }

  function search(q) {
    if (!q || q.length < 2 || !LCMS?.churches?.length) return { hits: [], total: 0 };
    const dash = q.indexOf(' — ');
    if (dash >= 0) q = q.slice(0, dash).trim();
    let tokens = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
    for (let i = 0; i < tokens.length - 1; i++) {
      const two = `${tokens[i]} ${tokens[i + 1]}`;
      if (STATE_NAMES[two]) { tokens.splice(i, 2, two); }
    }

    const ranked = [];
    for (const c of LCMS.churches) {
      const fields = {
        name:      (c.name || '').toLowerCase(),
        city:      (c.city || '').toLowerCase(),
        st:        (c.st   || '').toLowerCase(),
        zip:       (c.zip  || '').toLowerCase(),
        nameWords: (c.name || '').toLowerCase().split(/\s+/),
        cityWords: (c.city || '').toLowerCase().split(/\s+/)
      };
      let total = 0;
      let allMatched = true;
      for (const tok of tokens) {
        const s = scoreToken(tok, c, fields);
        if (s == null) { allMatched = false; break; }
        total += s;
      }
      if (allMatched) ranked.push([total, c]);
    }
    ranked.sort((a, b) => a[0] - b[0] || (b[1].att || 0) - (a[1].att || 0));
    return {
      hits: ranked.slice(0, MAX_RESULTS).map(([, c]) => c),
      total: ranked.length
    };
  }

  window.ChurchSearch = { search, MAX_RESULTS };
})();
