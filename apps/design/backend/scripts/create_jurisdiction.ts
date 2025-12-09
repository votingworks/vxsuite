import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { assertDefined } from '@votingworks/basics';
import { safeParse } from '@votingworks/types';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';
import { generateId } from '../src/utils';
import { Jurisdiction, StateCodeSchema } from '../src/types';

const USAGE = `Usage: pnpm create-jurisdiction --organizationId=<organizationId> --stateCode=<stateCode> "<name>"`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [name],
    values: { organizationId, stateCode },
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options: {
      organizationId: { type: 'string' },
      stateCode: { type: 'string' },
    },
  });
  if (!(name && organizationId && stateCode)) {
    console.log(USAGE);
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const organization = await workspace.store.getOrganization(organizationId);
  if (!organization) {
    throw new Error(`Organization with ID ${organizationId} does not exist`);
  }

  const stateCodeParsed = safeParse(StateCodeSchema, stateCode).assertOk(
    'Invalid state code'
  );

  const jurisdiction: Jurisdiction = {
    id: generateId(),
    name,
    stateCode: stateCodeParsed,
    organization,
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
