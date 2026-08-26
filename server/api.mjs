#!/usr/bin/env node
// LCMS dashboard API — serves the LCMS object from SQLite.
//
//   node server/api.mjs
//   LCMS_PORT=8000 node server/api.mjs
//
// Endpoints:
//   GET  /api/lcms              Full dashboard payload (same shape as scraped.json)
//   GET  /api/health            snapshot counts, year span, headline/history mismatch
//   POST /api/sql/execute       Run SQL
//   POST /api/sql/transaction   BEGIN | COMMIT | ROLLBACK
//   GET  /api/sql/tables        List tables
//   GET  /api/sql/tables/:name/columns
//   GET  /api/sql/saved         Saved queries by category
//   POST /api/sql/saved         Save query
//   PUT  /api/sql/saved/:id     Update saved query
//   DELETE /api/sql/saved/:id   Delete saved query

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gzipSync } from 'node:zlib';

import { describeHealth } from '../lib/dashboard-math.mjs';
import { acceptGzip, encodeBuffer, jsonResponseHeaders } from '../lib/http-encode.mjs';
import loadLcmsFromDb, { DEFAULT_DB } from '../lib/load-from-sql.mjs';
import {
  executeSql,
  runTransaction,
  listTables,
  listColumns,
  getSavedQueries,
  saveQuery,
  updateSavedQuery,
  deleteSavedQuery
} from '../lib/sql-console.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || process.env.LCMS_PORT || 8000);
const DB_PATH = process.env.LCMS_DB_PATH || DEFAULT_DB;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

let cache = null;
let cacheAt = 0;
let jsonBuf = null;
let gzipBuf = null;
const CACHE_MS = Number(process.env.LCMS_API_CACHE_MS || 5000);

function getLcms() {
  const now = Date.now();
  if (!cache || now - cacheAt > CACHE_MS) {
    cache = loadLcmsFromDb(DB_PATH);
    jsonBuf = null;
    gzipBuf = null;
    cacheAt = now;
  }
  return cache;
}

function getLcmsBuffers() {
  getLcms();
  if (!jsonBuf) {
    jsonBuf = Buffer.from(JSON.stringify(cache));
    gzipBuf = gzipSync(jsonBuf);
  }
  return { jsonBuf, gzipBuf };
}

function sendJson(req, res, status, body) {
  const raw = Buffer.from(JSON.stringify(body));
  const { body: buf, gzip } = encodeBuffer(raw, req.headers['accept-encoding']);
  res.writeHead(status, {
    ...jsonResponseHeaders(gzip),
    'Content-Length': buf.length
  });
  res.end(buf);
}

function sendLcms(req, res) {
  const { jsonBuf: raw, gzipBuf: gz } = getLcmsBuffers();
  const gzip = acceptGzip(req.headers['accept-encoding']);
  const buf = gzip ? gz : raw;
  res.writeHead(200, {
    ...jsonResponseHeaders(gzip),
    'Content-Length': buf.length
  });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  let path = req.url.split('?')[0];
  if (path === '/') path = '/index.html';
  const file = join(ROOT, path.replace(/^\//, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

function extname(file) {
  const i = file.lastIndexOf('.');
  return i >= 0 ? file.slice(i) : '';
}

async function handleSqlRoutes(req, res, path) {
  if (path === '/api/sql/execute' && req.method === 'POST') {
    const body = await readBody(req);
    const result = executeSql(DB_PATH, body.query || '');
    sendJson(req, res, result.success ? 200 : 400, result);
    return true;
  }

  if (path === '/api/sql/transaction' && req.method === 'POST') {
    sendJson(req, res, 403, runTransaction());
    return true;
  }

  if (path === '/api/sql/tables' && req.method === 'GET') {
    sendJson(req, res, 200, listTables(DB_PATH));
    return true;
  }

  const colMatch = path.match(/^\/api\/sql\/tables\/([^/]+)\/columns$/);
  if (colMatch && req.method === 'GET') {
    const result = listColumns(DB_PATH, decodeURIComponent(colMatch[1]));
    sendJson(req, res, result.success ? 200 : 400, result);
    return true;
  }

  if (path === '/api/sql/saved' && req.method === 'GET') {
    sendJson(req, res, 200, getSavedQueries());
    return true;
  }

  if (path === '/api/sql/saved' && req.method === 'POST') {
    const body = await readBody(req);
    const result = saveQuery(body);
    sendJson(req, res, result.success ? 200 : 400, result);
    return true;
  }

  const savedMatch = path.match(/^\/api\/sql\/saved\/(\d+)$/);
  if (savedMatch) {
    const id = Number(savedMatch[1]);
    if (req.method === 'PUT') {
      const body = await readBody(req);
      const result = updateSavedQuery(id, body);
      sendJson(req, res, result.success ? 200 : 400, result);
      return true;
    }
    if (req.method === 'DELETE') {
      const result = deleteSavedQuery(id);
      sendJson(req, res, result.success ? 200 : 400, result);
      return true;
    }
  }

  return false;
}

const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    if (path === '/api/health' && req.method === 'GET') {
      sendJson(req, res, 200, {
        ...describeHealth(getLcms()),
        source: 'sqlite',
        db: DB_PATH
      });
      return;
    }

    if (path === '/api/lcms' && req.method === 'GET') {
      sendLcms(req, res);
      return;
    }

    if (path.startsWith('/api/sql/')) {
      const handled = await handleSqlRoutes(req, res, path);
      if (handled) return;
      sendJson(req, res, 405, { success: false, error: 'Method not allowed' });
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405); res.end('Method not allowed'); return;
    }

    await serveStatic(req, res);
  } catch (err) {
    console.error('[api]', err);
    sendJson(req, res, 500, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`LCMS API + static server http://localhost:${PORT}`);
  console.log(`  DB: ${DB_PATH}`);
  console.log(`  Dashboard: http://localhost:${PORT}/index.html`);
  console.log(`  SQL:       http://localhost:${PORT}/sql.html`);
  console.log(`  API:       http://localhost:${PORT}/api/lcms`);
});
