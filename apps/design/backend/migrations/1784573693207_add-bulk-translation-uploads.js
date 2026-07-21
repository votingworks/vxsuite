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
  pgm.createTable(
    'bulk_translation_uploads',
    {
      election_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'elections',
      },
      language_code: {
        type: 'text',
        notNull: true,
      },
      uploaded_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    {
      constraints: {
        primaryKey: ['election_id', 'language_code'],
      },
    }
  );
};
