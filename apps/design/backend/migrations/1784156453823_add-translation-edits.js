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
    'translation_edits',
    {
      jurisdiction_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'jurisdictions',
      },
      language_code: {
        notNull: true,
        type: 'text',
      },
      english_text: {
        notNull: true,
        type: 'text',
      },
      text: {
        notNull: true,
        type: 'text',
      },
    },
    {
      constraints: {
        primaryKey: ['jurisdiction_id', 'language_code', 'english_text'],
      },
    }
  );
};
