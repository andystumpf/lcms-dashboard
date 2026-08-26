#!/usr/bin/env node
// Copy static dashboard files into public/ for Cloudflare Workers assets upload.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const token = process.env.CF_WEB_ANALYTICS_TOKEN?.trim();

const ANALYTICS_SNIPPET = token
  ? `\n  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>\n`
  : '';

function injectAnalytics(htmlPath) {
  if (!ANALYTICS_SNIPPET) return;
  const html = readFileSync(htmlPath, 'utf8');
  if (html.includes('static.cloudflareinsights.com/beacon.min.js')) return;
  writeFileSync(htmlPath, html.replace('</body>', `${ANALYTICS_SNIPPET}</body>`));
}

rmSync(PUBLIC, { recursive: true, force: true });
mkdirSync(PUBLIC, { recursive: true });

for (const file of ['index.html', 'compare.html', 'sql.html']) {
  cpSync(join(ROOT, file), join(PUBLIC, file));
}

cpSync(join(ROOT, 'css'), join(PUBLIC, 'css'), { recursive: true });
cpSync(join(ROOT, 'js'), join(PUBLIC, 'js'), { recursive: true });

mkdirSync(join(PUBLIC, 'lib'), { recursive: true });
for (const file of ['dashboard-math.mjs', 'church-search.mjs', 'story-math.mjs']) {
  cpSync(join(ROOT, 'lib', file), join(PUBLIC, 'lib', file));
}

for (const file of readdirSync(PUBLIC).filter(f => f.endsWith('.html'))) {
  injectAnalytics(join(PUBLIC, file));
}

console.log(`Prepared ${PUBLIC}${token ? ' (Web Analytics token injected)' : ''}`);
