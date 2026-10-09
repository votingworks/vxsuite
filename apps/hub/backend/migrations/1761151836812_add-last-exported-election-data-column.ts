import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('elections', {
    last_exported_election_data: {
      type: 'text',
      notNull: false,
    },
  });
}
