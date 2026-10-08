import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createIndex('districts', ['election_id', 'name'], { unique: true });
  pgm.createIndex('precincts', ['election_id', 'name'], { unique: true });
  pgm.createIndex('precinct_splits', ['precinct_id', 'name'], {
    unique: true,
  });
}
