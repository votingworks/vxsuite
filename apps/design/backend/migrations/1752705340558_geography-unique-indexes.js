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
  pgm.createIndex('districts', ['election_id', 'name'], { unique: true });
  pgm.createIndex('precincts', ['election_id', 'name'], { unique: true });
  pgm.createIndex('precinct_splits', ['precinct_id', 'name'], {
    unique: true,
  });
};
