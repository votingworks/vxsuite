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
  pgm.dropColumn('contests', 'candidate_columns');
  pgm.addColumn('elections', {
    large_contest_candidate_columns: {
      type: 'integer',
    },
  });
};
