import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { assert } from '@votingworks/basics';
import { stateDefaultSystemSettings } from '@votingworks/election-definition-backend';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { LanguageCode } from '@votingworks/types';
import { createWorkspace } from '../build/util/workspace.js';
import { generateElection } from './generate_election.ts';
import {
  ELECTION_PRESETS,
  isElectionPresetName,
  scaleSpec,
} from './presets.ts';

const { values } = parseArgs({
  options: {
    election: { type: 'string' },
    precincts: { type: 'string' },
    workspace: { type: 'string' },
  },
});
if (!values.election || !isElectionPresetName(values.election)) {
  throw new Error(
    `Usage: node seed_admin.ts --election <${Object.keys(ELECTION_PRESETS).join('|')}> [--precincts <n>] [--workspace <dir>]`
  );
}

const { election, spec, stats } = generateElection(
  scaleSpec(
    ELECTION_PRESETS[values.election],
    values.precincts ? Number(values.precincts) : undefined
  )
);
assert(
  spec.languageConfigs.every(
    (languages) =>
      languages.length === 1 && languages[0] === LanguageCode.ENGLISH
  ),
  'VxAdmin only builds English-only elections'
);

const workspacePath =
  values.workspace ??
  process.env['ADMIN_WORKSPACE'] ??
  join(import.meta.dirname, '../dev-workspace');
const { store } = createWorkspace(
  workspacePath,
  new BaseLogger(LogSource.VxAdminService)
);
const designStore = store.electionDefinition;
assert(
  store.getCurrentElectionId() === undefined,
  'Unconfigure VxAdmin before seeding an election definition'
);
assert(
  designStore.getElectionInfo() === undefined,
  'Discard the existing election definition before seeding another'
);

const electionId = election.id;
designStore.createInProgressElection(
  {
    electionId,
    type: election.type,
    date: election.date,
    title: election.title,
    state: election.state,
    jurisdictionName: election.jurisdiction.name,
    seal: election.seal,
    languageCodes: [LanguageCode.ENGLISH],
  },
  stateDefaultSystemSettings('DEMO')
);
designStore
  .updateDistricts({ electionId, newDistricts: [...election.districts] })
  .unsafeUnwrap();
designStore
  .updateParties({ electionId, newParties: [...election.parties] })
  .unsafeUnwrap();
for (const contest of election.contests) {
  designStore.createContest({ electionId, newContest: contest }).unsafeUnwrap();
}
for (const precinct of election.precincts) {
  designStore
    .createPrecinct({ electionId, newPrecinct: precinct })
    .unsafeUnwrap();
}
for (const place of election.pollingPlaces) {
  designStore.setPollingPlace({ electionId, place }).unsafeUnwrap();
}

const seededStyles = designStore.listBallotStyles(electionId).length;
console.log(
  `Seeded ${spec.name} into ${workspacePath}: ${stats.precincts} precincts, ${stats.contests} contests, ${seededStyles} ballot styles (generator: ${stats.ballotStyles}).`
);
