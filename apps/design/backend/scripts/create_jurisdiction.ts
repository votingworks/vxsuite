import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { assertDefined } from '@votingworks/basics';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';
import { generateId } from '../src/utils';
import { Jurisdiction } from '../src/types';

const USAGE = `Usage: pnpm create-jurisdiction "<name>"`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [name],
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
  });
  if (!name) {
    console.log(USAGE);
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const jurisdiction: Jurisdiction = {
    id: generateId(),
    name,
  };

  await workspace.store.createJurisdiction(jurisdiction);

  console.log('✅ Jurisdiction created:', jurisdiction);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
