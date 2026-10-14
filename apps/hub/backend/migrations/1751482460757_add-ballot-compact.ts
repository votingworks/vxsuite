import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('elections', {
    ballot_compact: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
  // Backfill the ballot_compact column for existing elections based on the ballot_template
  const electionTemplates = await pgm.db.select({
    text: 'SELECT id, ballot_template_id FROM elections',
  });
  for (const {
    id: electionId,
    ballot_template_id: ballotTemplateId,
  } of electionTemplates) {
    const compact =
      ballotTemplateId === 'NhBallotCompact' ||
      ballotTemplateId === 'NhBallotV3Compact';
    pgm.sql(
      `UPDATE elections SET ballot_compact = ${compact} WHERE id = '${electionId}'`
    );
  }
}
