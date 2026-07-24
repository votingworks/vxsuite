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
    'finalized_strings',
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
      string_key: {
        type: 'text',
        notNull: true,
      },
      subkey: {
        type: 'text',
        notNull: true,
        default: '',
      },
      finalized_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    {
      constraints: {
        primaryKey: ['election_id', 'language_code', 'string_key', 'subkey'],
      },
    }
  );
};
