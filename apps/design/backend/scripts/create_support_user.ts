import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { assert, assertDefined } from '@votingworks/basics';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { Auth0Client } from '../src/auth0_client';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';

const USAGE = `Usage: pnpm create-support-user <email address>; Support users must have a voting.works email`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [userEmail],
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options: {},
  });
  if (!userEmail || !userEmail.endsWith('@voting.works')) {
    console.log(USAGE);
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const votingWorksOrgId = assertDefined(
    process.env.ORG_ID_VOTINGWORKS,
    'ORG_ID_VOTINGWORKS environment variable is required'
  );
  const organization = await workspace.store.getOrganization(votingWorksOrgId);

  const auth = Auth0Client.init();

  const existingUserId = await workspace.store.getUserIdByEmail(userEmail);
  assert(!existingUserId, 'User already exists');

  const userId = await auth.createUser({ userEmail });
  await workspace.store.createUser({
    id: userId,
    type: 'support_user',
    name: userEmail,
    organization,
  });

  console.log(
    `✅ Support user created and added to organization ${organization.name}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
