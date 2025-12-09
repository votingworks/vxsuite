import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { resolve } from 'node:path';
import { WORKSPACE } from '../src/globals';
import { createWorkspace } from '../src/workspace';

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );
  const jurisdictions = await workspace.store.listJurisdictions();
  console.log('✅ Jurisdictions:', jurisdictions);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
