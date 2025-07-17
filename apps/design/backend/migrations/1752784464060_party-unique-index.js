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
  pgm.createIndex('parties', ['election_id', 'name'], { unique: true });
  pgm.createIndex('parties', ['election_id', 'full_name'], { unique: true });
  pgm.createIndex('parties', ['election_id', 'abbrev'], { unique: true });
};
