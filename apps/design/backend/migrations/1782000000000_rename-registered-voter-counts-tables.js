exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * Renames the registered voter count tables to the singular "voter" form, to
 * match VxAdmin and the rest of the codebase.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.renameTable(
    'precinct_registered_voters_counts',
    'precinct_registered_voter_counts'
  );
  pgm.renameTable(
    'precinct_split_registered_voters_counts',
    'precinct_split_registered_voter_counts'
  );
};
