import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = join(ROOT, 'data', 'lcms.db');
export const hasDb = existsSync(DB_PATH);

export function requireDb() {
  if (!hasDb) {
    throw new Error(`Expected SQLite snapshot at ${DB_PATH}`);
  }
}
