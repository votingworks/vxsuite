import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { assertDefined } from '@votingworks/basics';
import { Auth0Client } from '../src/auth0_client';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';

const USAGE = `Usage: pnpm create-org [options...] "<name>"

options:
    [--enableGoogleAuth]: Enables Google auth for this org, in addition to username/password logins.
    [--logoUrl=<url>]: URL for the login page logo for this org.
`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [name],
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
  if (!name) {
    console.log(USAGE);
    process.exit(0);
  }

  const auth = Auth0Client.init();
  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const org = await auth.createOrg({
    name,
    enableGoogleAuth,
    logoUrl,
  });
  await workspace.store.cacheOrganizations(await auth.allOrgs());

  console.log('✅ Org created:', org);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
