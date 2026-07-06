exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.addColumns('elections', {
    has_mi_combined_primary_ballot: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
  // Open primaries (all parties on one "combined" ballot) were previously
  // modeled as a distinct 'open-primary' election type. They are now modeled as
  // an ordinary 'primary' election with this flag set; open-vs-closed is
  // otherwise derived from whether ballot styles have a partyId.
  pgm.sql(
    "UPDATE elections SET has_mi_combined_primary_ballot = TRUE WHERE type = 'open-primary'"
  );
  // Collapse the 'open-primary'/'closed-primary' election types back to
  // 'primary'.
  pgm.sql(
    "UPDATE elections SET type = 'primary' WHERE type IN ('open-primary', 'closed-primary')"
  );
};
