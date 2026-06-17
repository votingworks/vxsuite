exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * Renames the election locality columns to match the election definition's
 * `county` -> `jurisdiction` rename. `jurisdiction_id` is already taken by the
 * owning-jurisdiction (tenant) FK, so the locality id column becomes
 * `jurisdiction_external_id` (it is the per-election CDF GpUnit / SEMS id).
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.renameColumn('elections', 'county_name', 'jurisdiction_name');
  pgm.renameColumn('elections', 'county_id', 'jurisdiction_external_id');
};
