import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { assert, assertDefined } from '@votingworks/basics';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { Auth0Client } from '../src/auth0_client';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';

const USAGE = `Usage: pnpm create-organization-user --organizationId=<string> <email address>`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [userEmail],
    values: { organizationId },
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options: {
      organizationId: { type: 'string' },
    },
  });
  if (!userEmail || !organizationId) {
    console.log(USAGE);
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const organization = await workspace.store.getOrganization(organizationId);

  const auth = Auth0Client.init();

  const existingUserId = await workspace.store.getUserIdByEmail(userEmail);
  assert(!existingUserId, 'User already exists');

  const userId = await auth.createUser({ userEmail });
  await workspace.store.createUser({
    id: userId,
    type: 'organization_user',
    name: userEmail,
    organization,
  });

  console.log(`✅ User created and added to organization ${organization.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
