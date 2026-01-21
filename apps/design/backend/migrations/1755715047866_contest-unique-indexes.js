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
  // pgm.createIndex doesn't support NULLS NOT DISTINCT, which we need since
  // contests.term_description and candidates.first_name/middle_name/last_name
  // can be NULL.
  pgm.sql(
    `
    CREATE UNIQUE INDEX contests_unique_index
    ON contests (district_id, title, seats, term_description, party_id)
    NULLS NOT DISTINCT
    `
  );
  pgm.sql(
    `
    CREATE UNIQUE INDEX candidates_unique_index
    ON candidates (contest_id, first_name, middle_name, last_name)
    NULLS NOT DISTINCT
    `
  );
};
