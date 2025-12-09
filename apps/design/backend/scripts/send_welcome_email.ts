import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { Auth0Client } from '../src/auth0_client';

const USAGE = `Usage: pnpm send-welcome-email <email address>`;

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
  await auth.sendWelcomeEmail({ userEmail });

  console.log(`✅ Welcome email sent to ${userEmail}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
