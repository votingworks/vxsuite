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
    'tts_strings',
    {
      election_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'elections',
      },
      key: {
        notNull: true,
        type: 'text',
      },
      subkey: {
        type: 'text',
      },
      language_code: {
        notNull: true,
        type: 'text',
      },
      export_source: {
        check: `export_source IN ('phonetic', 'text')`,
        default: 'text',
        notNull: true,
        type: 'text',
      },
      phonetic: {
        notNull: true,
        type: 'jsonb',
      },
      text: {
        notNull: true,
        type: 'text',
      },
    },
    {
      constraints: {
        primaryKey: ['election_id', 'key', 'subkey', 'language_code'],
      },
    }
  );
};
