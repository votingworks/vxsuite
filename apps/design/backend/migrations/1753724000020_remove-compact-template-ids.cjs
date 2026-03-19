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
  // Replace the compact ballot template IDs with the standard template IDs for
  // those templates. This should have been done in the add-ballot-compact
  // migration, but was forgotten.
  pgm.sql(
    `UPDATE elections SET ballot_template_id = 'NhBallot' WHERE ballot_template_id = 'NhBallotCompact'`
  );
  pgm.sql(
    `UPDATE elections SET ballot_template_id = 'NhBallotV3' WHERE ballot_template_id = 'NhBallotV3Compact'`
  );
};
