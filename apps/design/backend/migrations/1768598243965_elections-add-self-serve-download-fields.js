/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.addColumn('elections', {
    ballots_approved_at: { type: 'timestamptz' },
    official_ballots_url: { type: 'text' },
    sample_ballots_url: { type: 'text' },
    test_ballots_url: { type: 'text' },
  });
};
