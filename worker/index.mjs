import loadLcmsFromD1 from '../lib/load-from-d1.mjs';
import {
  executeSql,
  runTransaction,
  listTables,
  listColumns,
  getSavedQueries,
  saveQuery,
  updateSavedQuery,
  deleteSavedQuery
} from '../lib/sql-console-d1.mjs';
import defaultSavedQueries from '../data/sql-saved-queries.json';

const CACHE_MS = 5000;
let lcmsCache = null;
let lcmsCacheAt = 0;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*'
};

function sendJson(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function getLcms(db) {
  const now = Date.now();
  if (!lcmsCache || now - lcmsCacheAt > CACHE_MS) {
    lcmsCache = await loadLcmsFromD1(db);
    lcmsCacheAt = now;
  }
  return lcmsCache;
}

async function handleSqlRoutes(request, env, path) {
  const db = env.DB;
  const kv = env.SAVED_QUERIES;

  if (path === '/api/sql/execute' && request.method === 'POST') {
    const body = await readBody(request);
    return sendJson(await executeSql(db, body.query || ''));
  }

  if (path === '/api/sql/transaction' && request.method === 'POST') {
    return sendJson(runTransaction(), 403);
  }

  if (path === '/api/sql/tables' && request.method === 'GET') {
    return sendJson(await listTables(db));
  }

  const colMatch = path.match(/^\/api\/sql\/tables\/([^/]+)\/columns$/);
  if (colMatch && request.method === 'GET') {
    const result = await listColumns(db, decodeURIComponent(colMatch[1]));
    return sendJson(result, result.success ? 200 : 400);
  }

  if (path === '/api/sql/saved' && request.method === 'GET') {
    return sendJson(await getSavedQueries(kv, defaultSavedQueries));
  }

  if (path === '/api/sql/saved' && request.method === 'POST') {
    const body = await readBody(request);
    const result = await saveQuery(kv, defaultSavedQueries, body);
    return sendJson(result, result.success ? 200 : 400);
  }

  const savedMatch = path.match(/^\/api\/sql\/saved\/(\d+)$/);
  if (savedMatch) {
    const id = Number(savedMatch[1]);
    if (request.method === 'PUT') {
      const body = await readBody(request);
      const result = await updateSavedQuery(kv, defaultSavedQueries, id, body);
      return sendJson(result, result.success ? 200 : 400);
    }
    if (request.method === 'DELETE') {
      const result = await deleteSavedQuery(kv, defaultSavedQueries, id);
      return sendJson(result, result.success ? 200 : 400);
    }
  }

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    try {
      if (path === '/api/health' && request.method === 'GET') {
        const data = await getLcms(env.DB);
        return sendJson({
          ok: true,
          source: 'd1',
          fetchedAt: data.fetchedAt,
          churches: data.churches.length,
          districts: data.districts.length
        });
      }

      if (path === '/api/lcms' && request.method === 'GET') {
        return sendJson(await getLcms(env.DB));
      }

      if (path.startsWith('/api/sql/')) {
        const handled = await handleSqlRoutes(request, env, path);
        if (handled) return handled;
        return sendJson({ success: false, error: 'Method not allowed' }, 405);
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error('[worker]', err);
      return sendJson({ success: false, error: err.message }, 500);
    }
  }
};
