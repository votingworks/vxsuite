exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.createType('tts_export_source', ['phonetic', 'recorded', 'text']);

  pgm.dropConstraint('tts_edits', 'tts_edits_export_source_check');
  pgm.alterColumn('tts_edits', 'export_source', { default: null });
  pgm.alterColumn('tts_edits', 'export_source', {
    type: 'tts_export_source',
    using: 'export_source::tts_export_source',
    default: 'text',
  });

  // [TODO] Move this to a separate table:
  pgm.addColumns('tts_edits', {
    recording_data_url: { type: 'text' },
  });
};
