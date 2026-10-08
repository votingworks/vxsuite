import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  // Enables number-aware locale sorting, e.g.:
  // ```sql
  // select id, name from precincts
  // order by name collate natural_sort;
  // ```
  //
  // Leaving the collation level at the default `level3` for now, which makes
  // the ordering case/accent-insensitive, but we can alter later if needed.
  //
  // https://www.postgresql.org/docs/17/collation.html#ICU-COLLATION-SETTINGS-TABLE
  pgm.sql(`
    CREATE COLLATION natural_sort (
      provider = icu,
      locale = 'en-u-kn-true'
    );
  `);
}
