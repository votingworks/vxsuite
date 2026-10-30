import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';
import type { SystemSettings } from '@votingworks/types';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  const entries = await pgm.db.select({
    text: 'SELECT id, system_settings_data FROM elections',
  });
  for (const {
    id: electionId,
    system_settings_data: systemSettingsData,
  } of entries) {
    const systemSettings: SystemSettings = JSON.parse(systemSettingsData);
    await pgm.db.query({
      text: 'UPDATE elections SET system_settings_data = $1 WHERE id = $2',
      values: [
        JSON.stringify({
          ...systemSettings,
          adminAdjudicationReasons: [],
        }),
        electionId,
      ],
    });
  }
}
