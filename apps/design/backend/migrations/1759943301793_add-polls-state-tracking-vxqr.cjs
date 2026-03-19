exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Add polls_state column to results_reports table
  pgm.addColumn('results_reports', {
    polls_state: {
      type: 'text',
      notNull: true,
      default: "'polls_closed_final'",
    },
  });

  // Drop the existing primary key constraint
  pgm.dropConstraint('results_reports', 'results_reports_pkey');

  // Add new primary key that includes polls_state
  pgm.addConstraint('results_reports', 'results_reports_pkey', {
    primaryKey: ['ballot_hash', 'machine_id', 'is_live_mode', 'polls_state'],
  });

  // Remove the default after backfilling (so future inserts must specify polls_state)
  pgm.alterColumn('results_reports', 'polls_state', { default: null });
};
