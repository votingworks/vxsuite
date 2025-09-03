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
    'audio_overrides',
    {
      election_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'elections',
      },
      key: { notNull: true, type: 'text' },
      subkey: { notNull: true, type: 'text' },
      data_url: { notNull: true, type: 'text' },
      original_filename: { notNull: true, type: 'text' },
      uploaded_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    },
    {
      constraints: {
        primaryKey: ['election_id', 'key', 'subkey'],
      },
    }
  );
};
