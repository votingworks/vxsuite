import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { AuthClient } from '../src/auth/client';

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();

  const auth = AuthClient.init();
  const orgs = await auth.allOrgs();

  console.log('✅ Orgs:', orgs);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
