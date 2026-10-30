import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('elections', {
    jurisdiction_id: { type: 'text' },
  });
  pgm.sql(`UPDATE elections SET jurisdiction_id = CONCAT(id, '-county')`);
  pgm.alterColumn('elections', 'jurisdiction_id', { notNull: true });
}
