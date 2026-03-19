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
  pgm.addColumn('elections', {
    jurisdiction_id: { type: 'text' },
  });
  pgm.sql(`UPDATE elections SET jurisdiction_id = CONCAT(id, '-county')`);
  pgm.alterColumn('elections', 'jurisdiction_id', { notNull: true });
};
