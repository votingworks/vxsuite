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
    'background_tasks',
    {
      id: { type: 'text', primaryKey: true },
      task_name: { type: 'text', notNull: true },
      payload: { type: 'text', notNull: true },
      created_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      started_at: { type: 'timestamp' },
      completed_at: { type: 'timestamp' },
      error: { type: 'text' },
    },
    {
      ifNotExists: true,
    }
  );

  pgm.createTable(
    'elections',
    {
      id: { type: 'text', primaryKey: true },
      org_id: { type: 'text', notNull: true },
      election_data: { type: 'text', notNull: true },
      system_settings_data: { type: 'text', notNull: true },
      ballot_order_info_data: { type: 'text', notNull: true },
      precinct_data: { type: 'text', notNull: true },
      created_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      election_package_task_id: {
        type: 'text',
        references: 'background_tasks(id)',
        referencesConstraintName: 'fk_background_tasks',
        onDelete: 'SET NULL',
      },
      election_package_url: { type: 'text' },
      test_decks_task_id: {
        type: 'text',
        references: 'background_tasks(id)',
        referencesConstraintName: 'fk_test_decks_background_tasks',
        onDelete: 'SET NULL',
      },
      test_decks_url: { type: 'text' },
      ballot_template_id: { type: 'text', notNull: true },
      ballots_finalized_at: { type: 'timestamptz' },
      ballot_language_codes: {
        type: 'text[]',
        default: pgm.func('array[]::text[]'),
      },
    },
    {
      ifNotExists: true,
    }
  );

  pgm.createTable(
    'translation_cache',
    {
      source_text: { type: 'text', notNull: true },
      target_language_code: { type: 'text', notNull: true },
      translated_text: { type: 'text', notNull: true },
    },
    {
      constraints: {
        primaryKey: ['target_language_code', 'source_text'],
      },
      ifNotExists: true,
    }
  );

  pgm.createTable(
    'speech_synthesis_cache',
    {
      language_code: { type: 'text', notNull: true },
      source_text: { type: 'text', notNull: true },
      audio_clip_base64: { type: 'text', notNull: true },
    },
    {
      constraints: {
        primaryKey: ['language_code', 'source_text'],
      },
      ifNotExists: true,
    }
  );
};
