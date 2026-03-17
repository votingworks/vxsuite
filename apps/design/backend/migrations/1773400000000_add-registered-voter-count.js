/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumn('precincts', {
    registered_voter_count: { type: 'integer' },
  });

  pgm.addColumn('precinct_splits', {
    registered_voter_count: { type: 'integer' },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropColumn('precincts', 'registered_voter_count');
  pgm.dropColumn('precinct_splits', 'registered_voter_count');
};
