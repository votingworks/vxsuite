import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('elections', {
    contest_section_title_candidate: { type: 'text' },
    contest_section_description_candidate: { type: 'text' },
    contest_section_title_yesno: { type: 'text' },
    contest_section_description_yesno: { type: 'text' },
  });
}
