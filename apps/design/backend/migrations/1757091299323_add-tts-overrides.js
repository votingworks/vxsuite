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
    'tts_text_overrides',
    {
      election_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'elections',
      },
      key: { notNull: true, type: 'text' },
      subkey: { type: 'text' },
      text: { notNull: true, type: 'text' },
      updated_at: {
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

  pgm.createTable(
    'tts_phonetic_overrides',
    {
      election_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'elections',
      },
      key: { notNull: true, type: 'text' },
      subkey: { type: 'text' },
      ssml_chunks: { notNull: true, type: 'jsonb' },
      updated_at: {
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

  pgm.createTable(
    'audio_sources',
    {
      election_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'elections',
      },
      key: { notNull: true, type: 'text' },
      subkey: { type: 'text' },
      source: { notNull: true, type: 'text' },
    },
    {
      constraints: {
        primaryKey: ['election_id', 'key', 'subkey'],
        check: "source IN ('tts', 'phonetic', 'recorded')",
      },
    }
  );
};
