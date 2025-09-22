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
  // Add optional last_exported_ballot_hash field to elections table
  pgm.addColumns('elections', {
    last_exported_ballot_hash: { type: 'text', notNull: false },
  });
};
