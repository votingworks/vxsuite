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
  // pgm.createIndex doesn't support NULLS NOT DISTINCT, which we need since
  // term_description can be NULL.
  pgm.sql(
    `
    CREATE UNIQUE INDEX contests_unique_index
    ON contests (election_id, title, seats, term_description, party_id)
    NULLS NOT DISTINCT
    `
  );
  pgm.createIndex(
    'candidates',
    ['contest_id', 'first_name', 'middle_name', 'last_name'],
    { unique: true, name: 'candidates_unique_index' }
  );
};
