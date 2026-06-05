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
  // Add a ballot_order column to parties mirroring the serial column used by
  // contests/candidates, so party order is preserved as creation order rather
  // than being re-sorted alphabetically at query time. Existing parties are
  // backfilled in name order (per election) so existing elections keep their
  // current alphabetical appearance as their starting point.
  pgm.sql(`
    ALTER TABLE parties ADD COLUMN ballot_order integer;

    UPDATE parties p
    SET ballot_order = sub.rn
    FROM (
      SELECT id, row_number() OVER (ORDER BY election_id, name) AS rn
      FROM parties
    ) sub
    WHERE p.id = sub.id;

    CREATE SEQUENCE parties_ballot_order_seq OWNED BY parties.ballot_order;

    SELECT setval(
      'parties_ballot_order_seq',
      COALESCE((SELECT MAX(ballot_order) FROM parties), 1),
      (SELECT COUNT(*) FROM parties) > 0
    );

    ALTER TABLE parties
      ALTER COLUMN ballot_order SET DEFAULT nextval('parties_ballot_order_seq'),
      ALTER COLUMN ballot_order SET NOT NULL;

    ALTER TABLE parties ADD CONSTRAINT parties_ballot_order_key UNIQUE (ballot_order);
  `);
};
