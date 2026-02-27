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
  for (const table of ['results_reports', 'results_reports_partial']) {
    // Backfill NULL precinct_id to empty string
    pgm.sql(
      `UPDATE ${table} SET precinct_id = '' WHERE precinct_id IS NULL`
    );
    // Rename column from precinct_id to precinct_ids (comma-separated list)
    pgm.renameColumn(table, 'precinct_id', 'precinct_ids');
    // Make not null
    pgm.alterColumn(table, 'precinct_ids', {
      notNull: true,
      default: "''",
    });
    pgm.alterColumn(table, 'precinct_ids', { default: null });
  }
};
