import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createIndex('parties', ['election_id', 'name'], { unique: true });
  pgm.createIndex('parties', ['election_id', 'full_name'], { unique: true });
  pgm.createIndex('parties', ['election_id', 'abbrev'], { unique: true });
}
