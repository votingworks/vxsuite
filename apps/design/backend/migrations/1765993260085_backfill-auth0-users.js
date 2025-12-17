/* eslint-disable @typescript-eslint/no-var-requires */
const { ManagementClient } = require('auth0');
const { assert, assertDefined } = require('@votingworks/basics');
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
  if (process.env.NODE_ENV === 'production' || process.env.AUTH_ENABLED) {
    const auth0Client = new ManagementClient({
      clientId: assertDefined(process.env.AUTH0_CLIENT_ID),
      clientSecret: assertDefined(process.env.AUTH0_SECRET),
      domain: assertDefined(process.env.AUTH0_CLIENT_DOMAIN),
    });
    const PAGE_SIZE = 100;
    const { data: users } = await auth0Client.users.getAll({
      per_page: PAGE_SIZE,
    });
    assert(users.length <= PAGE_SIZE, 'More than one page of users found');
    for (const user of users) {
      // Auth0 orgs are now jurisdictions in our db
      const { data: userOrgs } = await auth0Client.users.getUserOrganizations({
        id: user.user_id,
      });
      const organizationIds = await pgm.db.query(`
        SELECT DISTINCT ON (organization_id) organization_id, name FROM jurisdictions WHERE id IN (${userOrgs
          .map((org) => `'${org.id}'`)
          .join(', ')});
      `);
      assert(
        organizationIds.rowCount === 1,
        `User ${user.name} belongs to multiple organizations: ${JSON.stringify(
          organizationIds.rows,
          null,
          2
        )}`
      );
      const userOrganizationId = organizationIds.rows[0].organization_id;
      pgm.sql(`
        INSERT INTO users (id, name, organization_id)
        VALUES ('${user.user_id}', '${user.name}', '${userOrganizationId}')
        ON CONFLICT (id) DO NOTHING;
      `);
      for (const org of userOrgs) {
        pgm.sql(`
          INSERT INTO users_jurisdictions (user_id, jurisdiction_id) VALUES (
            '${user.user_id}',
            '${org.id}'
          )
          ON CONFLICT (user_id, jurisdiction_id) DO NOTHING;
        `);
      }
    }
  }
};
