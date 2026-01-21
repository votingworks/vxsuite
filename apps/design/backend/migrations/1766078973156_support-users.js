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
  pgm.addTypeValue('user_type', 'support_user');
};
