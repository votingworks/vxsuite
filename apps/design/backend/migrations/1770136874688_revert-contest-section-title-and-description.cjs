/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.dropColumns('elections', [
    'contest_section_title_candidate',
    'contest_section_description_candidate',
    'contest_section_title_yesno',
    'contest_section_description_yesno',
  ]);
};
