import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
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
}
