import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { Auth0Client } from '../src/auth0_client';

const USAGE = `Usage: pnpm list-user-orgs <email address>`;

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

  const auth = Auth0Client.init();
  const orgs = await auth.userOrgs(userEmail);

  console.log(`✅ Org memberships for ${userEmail}:`, orgs);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
