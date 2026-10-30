import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    UPDATE elections
    SET ballot_template_id = 'NhBallot'
    WHERE ballot_template_id = 'NhBallotV3';
  `);
}
