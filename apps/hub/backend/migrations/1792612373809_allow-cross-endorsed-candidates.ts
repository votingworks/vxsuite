import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  // Cross-endorsed candidates are stored as separate same-name candidates with
  // different parties, so name uniqueness is now enforced in the app.
  pgm.sql('DROP INDEX candidates_unique_index');
}
