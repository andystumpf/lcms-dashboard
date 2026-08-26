import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { describe, it } from 'node:test';

import { acceptGzip, encodeBuffer, jsonResponseHeaders } from '../lib/http-encode.mjs';

describe('acceptGzip', () => {
  it('detects gzip in Accept-Encoding', () => {
    assert.equal(acceptGzip('gzip'), true);
    assert.equal(acceptGzip('deflate, gzip;q=1.0'), true);
    assert.equal(acceptGzip('identity'), false);
    assert.equal(acceptGzip(''), false);
  });
});

describe('encodeBuffer', () => {
  it('gzips large bodies when the client accepts gzip', () => {
    const raw = Buffer.from('x'.repeat(2048));
    const { body, gzip } = encodeBuffer(raw, 'gzip');
    assert.equal(gzip, true);
    assert.ok(body.length < raw.length);
    assert.equal(gunzipSync(body).toString(), raw.toString());
  });

  it('leaves small or identity responses uncompressed', () => {
    const small = Buffer.from('{"ok":true}');
    assert.equal(encodeBuffer(small, 'gzip').gzip, false);
    const large = Buffer.from('x'.repeat(2048));
    assert.equal(encodeBuffer(large, 'identity').gzip, false);
    assert.equal(encodeBuffer(large, 'identity').body, large);
  });
});

describe('jsonResponseHeaders', () => {
  it('sets Content-Encoding only when gzipped', () => {
    assert.equal(jsonResponseHeaders(true)['Content-Encoding'], 'gzip');
    assert.equal(jsonResponseHeaders(false)['Content-Encoding'], undefined);
    assert.equal(jsonResponseHeaders(true).Vary, 'Accept-Encoding');
  });
});
