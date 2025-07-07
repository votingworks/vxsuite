import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { Auth0Client } from '../src/auth0_client';

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();

  const auth = Auth0Client.init();
  const orgs = await auth.allOrgs();

  console.log('✅ Orgs:', orgs);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
