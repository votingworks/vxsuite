/* eslint-disable vx/gts-module-snake-case */
import { assert, assertDefined } from '@votingworks/basics';
import { ManagementClient } from 'auth0';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { Db } from '../src/db/db';

loadEnvVarsFromDotenvFiles();

async function main() {
  const db = new Db(new BaseLogger(LogSource.VxDesignService));
  await db.withClient((client) =>
    client.withTransaction(async () => {
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
      console.log(`Found ${users.length} users in Auth0`);
      let usersAlreadyInDb = 0;
      let usersBackfilled = 0;
      for (const user of users) {
        console.log(`Backfilling user ${user.user_id} (${user.name})`);
        // Auth0 orgs are now jurisdictions in our db
        const { data: userOrgs } = await auth0Client.users.getUserOrganizations(
          { id: user.user_id }
        );
        const organizationIds = await client.query(`
          SELECT DISTINCT ON (organization_id) organization_id, name FROM jurisdictions WHERE id IN (${userOrgs
            .map((org) => `'${org.id}'`)
            .join(', ')});
        `);
        assert(
          organizationIds.rowCount === 1,
          `User ${
            user.name
          } belongs to multiple organizations: ${JSON.stringify(
            organizationIds.rows,
            null,
            2
          )}`
        );
        const userOrganizationId = organizationIds.rows[0].organization_id;
        console.log(`  Mapped to organization ID ${userOrganizationId}`);
        const result = await client.query(`
          INSERT INTO users (id, name, organization_id)
          VALUES ('${user.user_id}', '${user.name}', '${userOrganizationId}')
          ON CONFLICT (id) DO NOTHING;
        `);
        console.log(`  Inserted ${result.rowCount} rows into users table`);
        if (result.rowCount === 0) {
          usersAlreadyInDb += 1;
        } else {
          usersBackfilled += 1;
        }
        for (const org of userOrgs) {
          const orgResult = await client.query(`
            INSERT INTO users_jurisdictions (user_id, jurisdiction_id) VALUES (
              '${user.user_id}',
              '${org.id}'
            )
            ON CONFLICT (user_id, jurisdiction_id) DO NOTHING;
          `);
          console.log(
            `  Inserted ${orgResult.rowCount} rows into users_jurisdictions for jurisdiction ${org.id}`
          );
        }
      }
      console.log({ usersAlreadyInDb, usersBackfilled });
      return true;
    })
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
