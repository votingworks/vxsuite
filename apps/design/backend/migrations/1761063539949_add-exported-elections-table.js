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
  // Create table to store exported election blobs for Live Reports validation
  pgm.createTable('exported_elections', {
    ballot_hash: {
      type: 'text',
      notNull: true,
      primaryKey: true,
    },
    election_id: {
      type: 'text',
      notNull: true,
      references: 'elections(id)',
      onDelete: 'CASCADE',
    },
    election_data: {
      type: 'text',
      notNull: true,
    },
    exported_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
};
