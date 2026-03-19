/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.addColumns('elections', {
    contest_section_title_candidate: { type: 'text' },
    contest_section_description_candidate: { type: 'text' },
    contest_section_title_yesno: { type: 'text' },
    contest_section_description_yesno: { type: 'text' },
  });
};
