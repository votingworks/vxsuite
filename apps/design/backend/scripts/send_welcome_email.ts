import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { AuthClient } from '../src/auth/client';

const USAGE = `Usage: pnpm send-welcome-email --orgId=<string> <email address>`;

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
  await auth.sendWelcomeEmail({ orgId, userEmail });

  console.log(`✅ Welcome email sent to ${userEmail}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
