/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.addColumn(
    'elections',
    {
      ballot_language_codes: {
        type: 'text[]',
        default: pgm.func('array[]::text[]'),
      },
    },
    { ifNotExists: true }
  );
};
