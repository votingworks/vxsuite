import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { AuthClient } from '../src/auth/client';

const USAGE = `Usage: pnpm create-org [options...] "<display name>"

options:
    [--enableGoogleAuth]: Enables Google auth for this org, in addition to username/password logins.
    [--logoUrl=<url>]: URL for the login page logo for this org.
`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [displayName],
    values: { enableGoogleAuth, logoUrl },
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options: {
      colorBg: { type: 'string' },
      colorPrimary: { type: 'string' },
      enableGoogleAuth: { type: 'boolean' },
      logoUrl: { type: 'string' },
    },
  });
  if (!displayName) {
    console.log(USAGE);
    process.exit(0);
  }

  const auth = AuthClient.init();
  const org = await auth.createOrg({
    displayName,
    enableGoogleAuth,
    logoUrl,
  });

  console.log('✅ Org created:', org);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
