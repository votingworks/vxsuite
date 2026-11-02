import { join } from 'node:path';

/** The SQLite schema for a database holding an imported election package. */
export const ELECTION_PACKAGE_SCHEMA_PATH = join(
  import.meta.dirname,
  '../../schema/election_package.sql'
);
