import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { assertDefined } from '@votingworks/basics';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { Auth0Client } from '../src/auth0_client';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';

const USAGE = `Usage: pnpm create-user --jurisdictionId=<string> <email address>`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [userEmail],
    values: { jurisdictionId },
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options: {
      jurisdictionId: { type: 'string' },
    },
  });
  if (!userEmail || !jurisdictionId) {
    console.log(USAGE);
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const jurisdiction = await workspace.store.getJurisdiction(jurisdictionId);

  const auth = Auth0Client.init();

  const existingUserId = await workspace.store.getUserIdByEmail(userEmail);
  if (existingUserId) {
    console.log('User already exists. Attempting to add to jurisdiction...');
    await workspace.store.addUserToJurisdiction(existingUserId, jurisdictionId);
    console.log(`✅ Existing user added to jurisdiction ${jurisdictionId}`);
    return;
  }

  const userId = await auth.createUser({ userEmail });
  await workspace.store.createUser({
    id: userId,
    name: userEmail,
    organization: jurisdiction.organization,
  });
  await workspace.store.addUserToJurisdiction(userId, jurisdictionId);

  console.log(`✅ User created and added to jurisdiction ${jurisdictionId}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
