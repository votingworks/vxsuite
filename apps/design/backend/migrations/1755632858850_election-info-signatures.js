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
  // Add optional signature fields to elections table
  pgm.addColumns('elections', {
    signature_image: { type: 'text', notNull: false },
    signature_caption: { type: 'text', notNull: false },
  });
};
