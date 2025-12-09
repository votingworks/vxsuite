import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { assertDefined } from '@votingworks/basics';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { Auth0Client } from '../src/auth0_client';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';

const USAGE = `Usage: pnpm create-user --orgId=<string> <email address>`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [userEmail],
    values: { orgId },
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options: {
      orgId: { type: 'string' },
    },
  });
  if (!userEmail || !orgId) {
    console.log(USAGE);
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const org = await workspace.store.getJurisdiction(orgId);
  if (!org) {
    throw new Error(`Organization with ID ${orgId} does not exist`);
  }

  const auth = Auth0Client.init();

  const existingUserId = await workspace.store.getUserIdByEmail(userEmail);
  if (existingUserId) {
    console.log('User already exists. Attempting to add to org...');
    await workspace.store.addUserToJurisdiction(existingUserId, orgId);
    console.log(`✅ Existing user added to org ${orgId}`);
    return;
  }

  const userId = await auth.createUser({ userEmail });
  await workspace.store.createUser({ id: userId, name: userEmail });
  await workspace.store.addUserToJurisdiction(userId, orgId);

  console.log(`✅ User created and added to org ${orgId}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
