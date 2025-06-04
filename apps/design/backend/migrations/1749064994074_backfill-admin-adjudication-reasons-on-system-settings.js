/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void>}
 */
exports.up = async (pgm) => {
  const entries = await pgm.db.select({
    text: 'SELECT id, system_settings_data FROM elections',
  });
  for (const {
    id: electionId,
    system_settings_data: systemSettingsData,
  } of entries) {
    /** @type import('@votingworks/types').SystemSettings */
    const systemSettings = JSON.parse(systemSettingsData);
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
};
