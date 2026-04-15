/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql(
    "UPDATE elections SET type = 'closed-primary' WHERE type = 'primary'"
  );
};
