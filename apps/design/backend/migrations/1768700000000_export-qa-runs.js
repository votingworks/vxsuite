exports.shorthands = /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (undefined);

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.createTable(
    'export_qa_runs',
    {
      id: { type: 'text', primaryKey: true },
      election_id: {
        type: 'text',
        notNull: true,
        references: 'elections(id)',
        onDelete: 'CASCADE',
      },
      export_package_url: { type: 'text', notNull: true },
      circleci_pipeline_id: { type: 'text' },
      circleci_workflow_id: { type: 'text' },
      status: { type: 'text', notNull: true, default: "'pending'" },
      status_message: { type: 'text' },
      results_url: { type: 'text' },
      job_url: { type: 'text' },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    },
    {
      ifNotExists: true,
    }
  );

  // Create index on election_id for faster lookups
  pgm.createIndex('export_qa_runs', 'election_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('export_qa_runs');
};
