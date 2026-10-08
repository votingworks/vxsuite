import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Add optional last_exported_ballot_hash field to elections table
  pgm.addColumns('elections', {
    last_exported_ballot_hash: { type: 'text', notNull: false },
  });
}
