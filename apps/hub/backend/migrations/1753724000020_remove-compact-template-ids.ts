import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Replace the compact ballot template IDs with the standard template IDs for
  // those templates. This should have been done in the add-ballot-compact
  // migration, but was forgotten.
  pgm.sql(
    `UPDATE elections SET ballot_template_id = 'NhBallot' WHERE ballot_template_id = 'NhBallotCompact'`
  );
  pgm.sql(
    `UPDATE elections SET ballot_template_id = 'NhBallotV3' WHERE ballot_template_id = 'NhBallotV3Compact'`
  );
}
