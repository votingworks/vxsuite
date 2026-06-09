import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import util from 'node:util';
import { resolve } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { assertDefined } from '@votingworks/basics';
import { safeParse } from '@votingworks/types';
import { createWorkspace } from '../src/workspace';
import { WORKSPACE } from '../src/globals';
import { generateId } from '../src/utils';
import {
  Jurisdiction,
  SoftwareVersionSchema,
  StateCodeSchema,
} from '../src/types';

const USAGE = `Usage: pnpm create-jurisdiction --organizationId=<organizationId> --stateCode=<stateCode> --softwareVersion=<softwareVersion> "<name>"`;

async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();
  const {
    positionals: [name],
    values: { organizationId, stateCode, softwareVersion },
  } = util.parseArgs({
    allowPositionals: true,
    args: process.argv.slice(2),
    options: {
      organizationId: { type: 'string' },
      stateCode: { type: 'string' },
      softwareVersion: { type: 'string' },
    },
  });
  if (!(name && organizationId && stateCode && softwareVersion)) {
    console.log(USAGE);
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const organization = await workspace.store.getOrganization(organizationId);

  const stateCodeParsed = safeParse(StateCodeSchema, stateCode).assertOk(
    'Invalid state code'
  );

  const softwareVersionParsed = safeParse(
    SoftwareVersionSchema,
    softwareVersion
  ).assertOk('Invalid software version');

  const jurisdiction: Jurisdiction = {
    id: generateId(),
    name,
    stateCode: stateCodeParsed,
    organization,
    softwareVersion: softwareVersionParsed,
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
