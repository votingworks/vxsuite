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
  // Add polling_place_id column to track which polling place submitted
  // the report.
  pgm.addColumn('results_reports', {
    polling_place_id: { type: 'text' },
  });
  pgm.addColumn('results_reports_partial', {
    polling_place_id: { type: 'text' },
  });

  // Drop the old precinct_id from partials — it stored the scanner's
  // configured precinct which is now replaced by polling_place_id.
  // Per-precinct splitting happens after page assembly, not at the
  // partial page level.
  pgm.dropColumn('results_reports_partial', 'precinct_id');

  // Backfill precinct_id to empty string for existing rows that have NULL,
  // then make it NOT NULL so it can be part of the primary key.
  pgm.sql(
    `UPDATE results_reports SET precinct_id = '' WHERE precinct_id IS NULL`
  );
  pgm.alterColumn('results_reports', 'precinct_id', { notNull: true });

  // Update the primary key to include precinct_id so we can store multiple
  // rows per machine report (one per precinct).
  pgm.dropConstraint('results_reports', 'results_reports_pkey');
  pgm.addConstraint('results_reports', 'results_reports_pkey', {
    primaryKey: [
      'ballot_hash',
      'machine_id',
      'is_live_mode',
      'polls_transition',
      'precinct_id',
    ],
  });
};
