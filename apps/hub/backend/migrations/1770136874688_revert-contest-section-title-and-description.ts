import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.dropColumns('elections', [
    'contest_section_title_candidate',
    'contest_section_description_candidate',
    'contest_section_title_yesno',
    'contest_section_description_yesno',
  ]);
}
