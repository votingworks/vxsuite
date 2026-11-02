import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DESIGN_SCHEMA_PATH = join(import.meta.dirname, '../schema.sql');

export interface DesignSchema {
  readonly sql: string;
  readonly hash: string;
}

export function readDesignSchema(): DesignSchema {
  const sql = readFileSync(DESIGN_SCHEMA_PATH, 'utf8');
  return { sql, hash: createHash('sha256').update(sql).digest('hex') };
}
