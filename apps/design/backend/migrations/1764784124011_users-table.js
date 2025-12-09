/* eslint-disable @typescript-eslint/no-var-requires */
const { ManagementClient } = require('auth0');
const basics = require('@votingworks/basics');
const { votingWorksOrgId } = require('../build/globals');

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
  // Copy Auth0 users into a local database table so that we can manage user-organization
  // relationships locally (rather than storing them in Auth0).
  pgm.createTable('users', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
  });
  pgm.createTable(
    'users_organizations',
    {
      user_id: {
        type: 'text',
        notNull: true,
        references: 'users',
        onDelete: 'CASCADE',
      },
      organization_id: {
        type: 'text',
        notNull: true,
        references: 'organizations',
        onDelete: 'CASCADE',
      },
    },
    {
      constraints: {
        primaryKey: ['user_id', 'organization_id'],
      },
    }
  );

  if (process.env.NODE_ENV === 'production' || process.env.AUTH_ENABLED) {
    const auth0Client = new ManagementClient({
      clientId: basics.assertDefined(process.env.AUTH0_CLIENT_ID),
      clientSecret: basics.assertDefined(process.env.AUTH0_SECRET),
      domain: basics.assertDefined(process.env.AUTH0_CLIENT_DOMAIN),
    });
    const { data: users } = await auth0Client.users.getAll();
    for (const user of users) {
      pgm.sql(`
        INSERT INTO users (id, name) VALUES (
          '${user.user_id}',
          '${user.name}'
        );
      `);

      const { data: userOrgs } = await auth0Client.users.getUserOrganizations({
        id: user.user_id,
      });
      for (const org of userOrgs) {
        pgm.sql(`
          INSERT INTO users_organizations (user_id, organization_id) VALUES (
            '${user.user_id}',
            '${org.id}'
          );
        `);
      }
    }
  } else if (process.env.NODE_ENV !== 'test') {
    // In dev mode, create the default dev user
    pgm.sql(`
      INSERT INTO users (id, name) VALUES (
        'auth0|devuser',
        'Dev User'
      );
    `);

    // Add the dev user to the dev organization (use VotingWorks org ID to get full features)
    pgm.sql(`
      INSERT INTO users_organizations (user_id, organization_id) VALUES (
        'auth0|devuser',
        '${votingWorksOrgId()}'
      );
    `);
  }
};
