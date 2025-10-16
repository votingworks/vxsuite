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
  // Create a table to store partial QR code pages for quick results reporting.
  // This mirrors the `results_reports` table but includes page_index and num_pages
  // so multi-page QR payloads can be saved and reassembled when the final
  // page arrives.
  pgm.createTable(
    'results_reports_partial',
    {
      machine_id: { type: 'text', notNull: true },
      election_id: { type: 'text', notNull: true },
      ballot_hash: { type: 'text', notNull: true },
      is_live_mode: { type: 'boolean', notNull: true },
      signed_at: {
        type: 'timestamptz',
        notNull: true,
      },
      encoded_compressed_tally: { type: 'text', notNull: true },
      precinct_id: { type: 'text' }, // Null for non-precinct-specific results
      polls_state: { type: 'text', notNull: true },
      page_index: { type: 'integer', notNull: true },
      num_pages: { type: 'integer', notNull: true },
    },
    {
      constraints: {
        // Primary key includes page_index so each page is stored uniquely.
        primaryKey: [
          'ballot_hash',
          'machine_id',
          'is_live_mode',
          'polls_state',
          'page_index',
        ],
      },
      ifNotExists: true,
    }
  );
};
