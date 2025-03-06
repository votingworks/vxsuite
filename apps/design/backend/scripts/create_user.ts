import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { ManagementApiError } from 'auth0';
import { AuthClient } from '../src/auth/client';

const USAGE = `Usage: pnpm create-user --orgId=<string> <email address>`;

enum ErrorCode {
  ALREADY_EXISTS = 409,
}

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

  const auth = AuthClient.init();
  try {
    const { orgName } = await auth.createUser({ orgId, userEmail });

    console.log(`✅ User created and added to org '${orgName}'`);
  } catch (error) {
    if (!(error instanceof ManagementApiError)) {
      throw error;
    }

    // [TODO] move this fallback logic into the auth client layer. We can
    // decouple user creation and org membership, so that `createUser` is
    // idempotent.
    if ((error.statusCode as ErrorCode) === ErrorCode.ALREADY_EXISTS) {
      console.log('User already exists. Attempting to add to org...');
      const { orgName } = await auth.addOrgMember({ orgId, userEmail });

      console.log(`✅ Existing user added to org '${orgName}'`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
