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
  // Create a table for quick results reporting to store reported results.
  pgm.createTable(
    'results_reports',
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
    },
    {
      constraints: {
        primaryKey: ['ballot_hash', 'machine_id', 'is_live_mode'],
      },
      ifNotExists: true,
    }
  );
};
