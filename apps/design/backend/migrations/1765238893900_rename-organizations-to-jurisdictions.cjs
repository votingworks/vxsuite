exports.shorthands =
  /** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */ (
    undefined
  );

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.renameTable('organizations', 'jurisdictions');
  pgm.renameTable('users_organizations', 'users_jurisdictions');
  pgm.renameColumn('users_jurisdictions', 'organization_id', 'jurisdiction_id');
  pgm.renameConstraint(
    'users_jurisdictions',
    'users_organizations_user_id_fkey',
    'users_jurisdictions_user_id_fkey'
  );
  pgm.renameColumn('elections', 'jurisdiction', 'county_name');
  pgm.renameColumn('elections', 'jurisdiction_id', 'county_id');
  pgm.renameColumn('elections', 'org_id', 'jurisdiction_id');
  pgm.renameConstraint(
    'elections',
    'elections_fk_org_id',
    'elections_jurisdiction_id_fkey'
  );
  // node-pg-migrate doesn't have a renameIndex method yet
  pgm.sql(
    'ALTER INDEX elections_org_id_title_date_unique_index RENAME TO elections_jurisdiction_id_title_date_unique_index;'
  );
  pgm.renameColumn('tts_edits', 'org_id', 'jurisdiction_id');
  pgm.renameConstraint(
    'tts_edits',
    'tts_edits_org_id_fkey',
    'tts_edits_jurisdiction_id_fkey'
  );
};
