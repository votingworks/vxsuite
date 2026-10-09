import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumn('elections', {
    ballots_approved_at: { type: 'timestamptz' },
    official_ballots_url: { type: 'text' },
    sample_ballots_url: { type: 'text' },
    test_ballots_url: { type: 'text' },
  });
}
