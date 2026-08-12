#!/usr/bin/env node
// Export data/lcms.db to db/d1-seed.sql for wrangler d1 execute --remote --file=...

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = join(ROOT, 'data', 'lcms.db');
const OUT_DIR = join(ROOT, 'db');
const OUT = join(OUT_DIR, 'd1-seed.sql');

mkdirSync(OUT_DIR, { recursive: true });

execFileSync('sh', ['-c', `sqlite3 "${DB}" .dump > "${OUT}"`]);

const dump = readFileSync(OUT, 'utf8');
const cleaned = dump
  .split('\n')
  .filter(line => {
    if (line.startsWith('PRAGMA')) return false;
    if (line.startsWith('BEGIN TRANSACTION')) return false;
    if (line.startsWith('COMMIT')) return false;
    return true;
  })
  .join('\n');

writeFileSync(OUT, cleaned + '\n');
console.log(`Wrote ${OUT} (${Math.round(cleaned.length / 1024)} KiB)`);
console.log('Import with: npm run db:import');
