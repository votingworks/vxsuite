import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createType('software_version', ['v4.0', 'v4.1']);
  pgm.addColumn('jurisdictions', {
    software_version: {
      type: 'software_version',
    },
  });
  pgm.sql(`
    UPDATE jurisdictions
    SET software_version = 'v4.0'
  `);
  pgm.alterColumn('jurisdictions', 'software_version', {
    notNull: true,
  });
}
