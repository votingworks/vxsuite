import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // Migrate old polls state values to transition type values
  for (const table of ['results_reports', 'results_reports_partial']) {
    pgm.sql(
      `UPDATE ${table} SET polls_state = 'open_polls' WHERE polls_state = 'polls_open'`
    );
    pgm.sql(
      `UPDATE ${table} SET polls_state = 'close_polls' WHERE polls_state = 'polls_closed_final'`
    );
    pgm.sql(
      `UPDATE ${table} SET polls_state = 'pause_voting' WHERE polls_state = 'polls_paused'`
    );
  }

  // Rename the column from polls_state to polls_transition
  pgm.renameColumn('results_reports', 'polls_state', 'polls_transition');
  pgm.renameColumn(
    'results_reports_partial',
    'polls_state',
    'polls_transition'
  );
}
