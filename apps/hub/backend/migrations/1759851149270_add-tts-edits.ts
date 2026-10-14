import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropTable('tts_strings');

  pgm.createTable(
    'tts_edits',
    {
      election_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'elections',
      },
      language_code: {
        notNull: true,
        type: 'text',
      },
      original: {
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
        primaryKey: ['election_id', 'language_code', 'original'],
      },
    }
  );
}
