import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Drop the ballot_order_info_data column from elections table
  pgm.dropColumns('elections', ['ballot_order_info_data']);
}
