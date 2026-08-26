import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { DB_PATH, requireDb } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18000 + (process.pid % 1000);
const BASE = `http://127.0.0.1:${PORT}`;

let child;

function waitForListen(proc, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`server did not start: ${buf.slice(-500)}`));
    }, timeoutMs);
    const onData = (chunk) => {
      buf += chunk;
      if (buf.includes('LCMS API')) {
        cleanup();
        resolve();
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`server exited ${code} before listen: ${buf.slice(-500)}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout.off('data', onData);
      proc.off('exit', onExit);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (chunk) => { buf += chunk; });
    proc.once('error', (err) => {
      cleanup();
      reject(err);
    });
    proc.once('exit', onExit);
  });
}

async function json(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    signal: opts.signal ?? AbortSignal.timeout(90000)
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { res, body };
}

function rawGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('HTTP smoke', () => {
  before(async () => {
    requireDb();
    child = spawn(process.execPath, ['server/api.mjs'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        LCMS_PORT: String(PORT),
        LCMS_DB_PATH: DB_PATH,
        LCMS_API_CACHE_MS: '60000'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForListen(child);
  });

  after(() => {
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  });

  it('serves health with snapshot integrity fields', async () => {
    const { res, body } = await json('/api/health');
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.source, 'sqlite');
    assert.ok(body.churches >= 5000);
    assert.equal(body.districts, 35);
    assert.ok(body.officialCongregations);
    assert.ok(body.withHistory);
    assert.ok(body.historyEnd);
    assert.ok(body.headlineYear);
    assert.ok(body.districtYearly >= 35);
    assert.ok(body.members > 0);
    assert.ok(body.members < body.churches);
    assert.ok(Number.isInteger(body.headlineHistoryMismatch));
    assert.equal(body.duplicateNameGroups, 23);
    assert.ok(body.givingHeadlineMillions > body.givingHistoryMillions);
  });

  it('serves the dashboard pages', async () => {
    for (const path of ['/', '/index.html', '/compare.html', '/sql.html']) {
      const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10000) });
      assert.equal(res.status, 200, path);
      const html = await res.text();
      assert.match(html, /<html/i);
    }
  });

  it('runs a read-only SQL query and rejects writes', async () => {
    const ok = await json('/api/sql/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'SELECT 1 AS n' })
    });
    assert.equal(ok.res.status, 200);
    assert.equal(ok.body.success, true);
    assert.deepEqual(ok.body.results, [{ n: 1 }]);

    for (const query of ['DROP TABLE churches', 'DELETE FROM churches']) {
      const bad = await json('/api/sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      assert.equal(bad.res.status, 400, query);
      assert.equal(bad.body.success, false);
    }
  });

  it('gzips the LCMS payload when the client asks for it', async () => {
    const gz = await rawGet('/api/lcms', { 'Accept-Encoding': 'gzip' });
    assert.equal(gz.status, 200);
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.ok(gz.buf.length < 3_000_000, `gzipped payload was ${gz.buf.length} bytes`);
    const data = JSON.parse(gunzipSync(gz.buf).toString('utf8'));
    assert.ok(data.churches.length >= 5000);
    assert.equal(data.districts.length, 35);
    assert.ok(data.districtYearly);
  });
});
