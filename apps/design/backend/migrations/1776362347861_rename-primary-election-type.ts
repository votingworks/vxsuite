import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(
    "UPDATE elections SET type = 'closed-primary' WHERE type = 'primary'"
  );
}
