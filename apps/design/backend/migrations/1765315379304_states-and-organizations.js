/* eslint-disable @typescript-eslint/no-var-requires */
const { generateId } = require('../build/utils');
const {
  votingWorksJurisdictionId,
  vxDemosJurisdictionId,
  sliJurisdictionId,
} = require('../build/globals');

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  // Add states enum
  pgm.createType('state_code', ['DEMO', 'MS', 'NH']);

  // Add organizations (containers of jurisdictions)
  pgm.createTable('organizations', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
  });

  // Each jurisdiction belongs to an organization and a state
  pgm.addColumn('jurisdictions', {
    // nullable for now to allow migration
    organization_id: { type: 'text', references: 'organizations' },
    // nullable for now to allow migration
    state_code: { type: 'state_code' },
  });

  // eslint-disable-next-line vx/gts-object-literal-types
  const newOrgIds = {
    votingWorks: generateId(),
    newHampshire: generateId(),
    mississippi: generateId(),
    sli: generateId(),
  };
  pgm.sql(`
    INSERT INTO organizations (id, name)
    VALUES
      ('${newOrgIds.votingWorks}', 'VotingWorks'),
      ('${newOrgIds.newHampshire}', 'New Hampshire'),
      ('${newOrgIds.mississippi}', 'Mississippi'),
      ('${newOrgIds.sli}', 'SLI');
  `);

  // Migrate existing jurisdictions to the correct organizations. Set a default
  // state code for each org's jurisdictions. We can clean up any inaccuracies
  // by hand later.
  const cityOfVxJurisdictionId = 'org_sokrNBF0CEVGNZmt';
  pgm.sql(`
    UPDATE jurisdictions
    SET
      state_code = 'DEMO',
      organization_id = '${newOrgIds.votingWorks}'
    WHERE id IN ('${votingWorksJurisdictionId()}', '${vxDemosJurisdictionId()}', '${cityOfVxJurisdictionId}');
  `);
  pgm.sql(`
    UPDATE jurisdictions
    SET
      state_code = 'DEMO',
      organization_id = '${newOrgIds.sli}'
    WHERE id = '${sliJurisdictionId()}';
  `);
  pgm.sql(`
    UPDATE jurisdictions
    SET
      state_code = 'NH',
      organization_id = '${newOrgIds.newHampshire}'
    WHERE organization_id IS NULL;
  `);

  // Now that we've filled in columns, we can set NOT NULL constraints
  pgm.alterColumn('jurisdictions', 'state_code', { notNull: true });
  pgm.alterColumn('jurisdictions', 'organization_id', { notNull: true });

  // Users also belong to organizations
  pgm.addColumn('users', {
    // nullable for now to allow migration
    organization_id: { type: 'text', references: 'organizations' },
  });

  // We'd like to enforce that users can only be assigned to jurisdictions
  // within their organization, but it's complex to do at the database level, so
  // we'll just handle it in the app.
  //
  // For now, we just remove VX users from other organizations' jurisdictions
  // to clean up. They were the only violations at the time of migrating.
  pgm.sql(`
    DELETE FROM users_jurisdictions
    WHERE user_id IN (
      SELECT users.id FROM users
      JOIN users_jurisdictions ON users.id = users_jurisdictions.user_id
      JOIN jurisdictions ON users_jurisdictions.jurisdiction_id = jurisdictions.id
      WHERE jurisdictions.organization_id = '${newOrgIds.votingWorks}'
    ) AND jurisdiction_id NOT IN (
      SELECT jurisdictions.id FROM jurisdictions
      WHERE jurisdictions.organization_id = '${newOrgIds.votingWorks}'
    );
  `);

  // Migrate users' organization_id based on their jurisdictions
  pgm.sql(`
    UPDATE users
    SET organization_id = jurisdictions.organization_id
    FROM jurisdictions, users_jurisdictions
    WHERE jurisdictions.id = users_jurisdictions.jurisdiction_id
      AND users.id = users_jurisdictions.user_id;
  `);

  // Delete any users that had no jurisdictions (and thus no organization)
  pgm.sql(`
    DELETE FROM users
    WHERE organization_id IS NULL;
  `);

  // Now that we've filled in organization_id, we can set NOT NULL constraint
  pgm.alterColumn('users', 'organization_id', { notNull: true });
};
