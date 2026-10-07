import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('background_tasks', {
    interrupted_at: {
      type: 'timestamp',
      notNull: false,
    },
  });
}
