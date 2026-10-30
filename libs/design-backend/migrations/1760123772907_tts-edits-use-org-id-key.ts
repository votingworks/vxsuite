import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // The `tts_edits` table is unused at this point in time.
  pgm.dropTable('tts_edits');

  pgm.createTable(
    'tts_edits',
    {
      org_id: {
        type: 'text',
        notNull: true,
        onDelete: 'CASCADE',
        references: 'organizations',
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
        primaryKey: ['org_id', 'language_code', 'original'],
      },
    }
  );
}
