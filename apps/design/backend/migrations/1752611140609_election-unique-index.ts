import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createIndex('elections', ['org_id', 'title', 'date'], {
    unique: true,
    where: `title != ''`,
  });
}
