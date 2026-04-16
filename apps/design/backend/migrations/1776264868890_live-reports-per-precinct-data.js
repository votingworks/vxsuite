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
  // Clear existing data — Polling Place IDs are now required, so existing rows would violate the new schema.
  pgm.sql('DELETE FROM results_reports');
  pgm.sql('DELETE FROM results_reports_partial');

  // Add polling_place_id to results_reports for tracking which polling
  // place submitted a status update.
  pgm.addColumn('results_reports', {
    polling_place_id: { type: 'text', notNull: true },
  });

  // Drop columns from results_reports that are no longer needed — tallies
  // are now stored in the separate results_report_tallies table, and
  // precinct tracking is replaced by polling_place_id.
  pgm.dropColumn('results_reports', 'encoded_compressed_tally');
  pgm.dropColumn('results_reports', 'precinct_id');

  // Add polling_place_id to results_reports_partial for paginated reports.
  pgm.addColumn('results_reports_partial', {
    polling_place_id: { type: 'text', notNull: true },
  });

  // Drop precinct_id from partials — per-precinct splitting happens after
  // page assembly, not at the partial level.
  pgm.dropColumn('results_reports_partial', 'precinct_id');

  // Create a separate table for per-precinct tally data. Each close_polls
  // report produces one row per precinct with a V0-encoded tally blob.
  // This separates tally storage from machine status tracking in
  // results_reports.
  pgm.createTable(
    'results_report_tallies',
    {
      ballot_hash: { type: 'text', notNull: true },
      election_id: { type: 'text', notNull: true },
      machine_id: { type: 'text', notNull: true },
      is_live_mode: { type: 'boolean', notNull: true },
      polling_place_id: { type: 'text', notNull: true },
      precinct_id: { type: 'text', notNull: true },
      encoded_compressed_tally: { type: 'text', notNull: true },
      signed_at: { type: 'timestamptz', notNull: true },
    },
    {
      constraints: {
        primaryKey: [
          'ballot_hash',
          'machine_id',
          'is_live_mode',
          'precinct_id',
        ],
      },
    }
  );
};
