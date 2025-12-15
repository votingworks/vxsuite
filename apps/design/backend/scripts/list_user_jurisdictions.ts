import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';

const USAGE = `Usage: pnpm list-user-jurisdictions <email address>`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [userEmail],
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
  });

  if (!userEmail) {
    console.log(USAGE);
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );
  const userId = await workspace.store.getUserIdByEmail(userEmail);
  if (!userId) {
    throw new Error(`No user found with email address ${userEmail}`);
  }
  const user = assertDefined(await workspace.store.getUser(userId));

  switch (user.type) {
    case 'jurisdiction_user':
      console.log(
        `✅ Jurisdiction user ${userEmail} has access to:`,
        user.jurisdictions
      );
      break;
    case 'organization_user':
      console.log(
        `✅ Organization user ${userEmail} has access to all jurisdictions in organization ${user.organization.name}:`,
        await workspace.store.listJurisdictions({
          organizationId: user.organization.id,
        })
      );
      break;
    default:
      throwIllegalValue(user);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
