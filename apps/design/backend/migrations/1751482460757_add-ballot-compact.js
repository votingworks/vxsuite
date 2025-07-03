/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void>}
 */
exports.up = async (pgm) => {
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
    await pgm.db.query({
      text: 'UPDATE elections SET ballot_compact = $1 WHERE id = $2',
      values: [compact, electionId],
    });
  }
};
