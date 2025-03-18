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
  pgm.addColumns(
    'elections',
    {
      test_decks_task_id: {
        type: 'text',
        references: 'background_tasks(id)',
        referencesConstraintName: 'fk_test_decks_background_tasks',
        onDelete: 'SET NULL',
      },
      test_decks_url: { type: 'text' },
    },
    {
      // These columns were missing from the prod DB, so they also appear in the
      // 'init' migration script.
      ifNotExists: true,
    }
  );
};
