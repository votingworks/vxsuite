import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('candidates', {
    designation: { type: 'text' },
  });
}
