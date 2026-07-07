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
    is_mi_combined_ballot_primary: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
  // Combined ballot primaries (all parties' contests on one ballot) were
  // previously modeled as a distinct 'open-primary' election type. They are now
  // modeled as an ordinary 'primary' election with this flag set; whether ballot
  // styles have a partyId is otherwise derived from the ballot styles themselves.
  pgm.sql(
    "UPDATE elections SET is_mi_combined_ballot_primary = TRUE WHERE type = 'open-primary'"
  );
  // Collapse the 'open-primary'/'closed-primary' election types back to
  // 'primary'.
  pgm.sql(
    "UPDATE elections SET type = 'primary' WHERE type IN ('open-primary', 'closed-primary')"
  );
};
