/* eslint-disable @typescript-eslint/no-var-requires */
const { ManagementClient } = require('auth0');
const { assertDefined } = require('@votingworks/basics');
const { loadEnvVarsFromDotenvFiles } = require('@votingworks/backend');
const { votingWorksOrgId } = require('../build/globals');

loadEnvVarsFromDotenvFiles();

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
  pgm.createTable('organizations', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
  });

  if (process.env.NODE_ENV === 'production' || process.env.AUTH_ENABLED) {
    const auth0Client = new ManagementClient({
      clientId: assertDefined(process.env.AUTH0_CLIENT_ID),
      clientSecret: assertDefined(process.env.AUTH0_SECRET),
      domain: assertDefined(process.env.AUTH0_CLIENT_DOMAIN),
    });
    const organizations = (await auth0Client.organizations.getAll()).data;
    for (const org of organizations) {
      pgm.sql(
        `INSERT INTO organizations (id, name) VALUES (
        '${org.id}',
        '${org.display_name}'
      )`
      );
    }
  } else if (process.env.NODE_ENV !== 'test') {
    // In dev mode, create the default dev organization (use VotingWorks org ID to get full features)
    pgm.sql(`
      INSERT INTO organizations (id, name) VALUES (
        '${votingWorksOrgId()}',
        'VotingWorks'
      );
    `);
  }

  pgm.addConstraint('elections', null, {
    foreignKeys: {
      columns: 'org_id',
      references: 'organizations',
      onDelete: 'CASCADE',
    },
  });
};
