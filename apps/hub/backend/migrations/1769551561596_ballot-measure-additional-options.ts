import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('contests', {
    additional_options: { type: 'jsonb' },
  });
}
