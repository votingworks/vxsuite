/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createTable('precinct_registered_voters_counts', {
    precinct_id: {
      type: 'text',
      notNull: true,
      primaryKey: true,
      references: 'precincts(id)',
      onDelete: 'CASCADE',
    },
    count: { type: 'integer', notNull: true },
  });

  pgm.createTable('precinct_split_registered_voters_counts', {
    split_id: {
      type: 'text',
      notNull: true,
      primaryKey: true,
      references: 'precinct_splits(id)',
      onDelete: 'CASCADE',
    },
    count: { type: 'integer', notNull: true },
  });
};
