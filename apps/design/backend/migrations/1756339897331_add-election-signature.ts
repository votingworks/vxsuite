import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Add optional signature field to elections table
  pgm.addColumns('elections', {
    signature: { type: 'jsonb', notNull: false },
  });
}
