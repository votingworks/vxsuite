import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Renames the registered voter count tables to the singular "voter" form, to
 * match VxAdmin and the rest of the codebase.
 */
export function up(pgm: MigrationBuilder): void {
  pgm.renameTable(
    'precinct_registered_voters_counts',
    'precinct_registered_voter_counts'
  );
  pgm.renameTable(
    'precinct_split_registered_voters_counts',
    'precinct_split_registered_voter_counts'
  );
}
