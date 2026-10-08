import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('election_external_source', ['ms-sems']);
  pgm.addColumn('elections', {
    external_source: { type: 'election_external_source' },
  });
}
