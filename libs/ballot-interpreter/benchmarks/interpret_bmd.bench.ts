import { afterAll, beforeAll, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { asSheet, DEFAULT_MARK_THRESHOLDS } from '@votingworks/types';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  type ElectionPackageIncluding,
  ElectionPackageStore,
} from '@votingworks/backend';
import { interpretSheet } from '../src/index.js';
import {
  makeInterpreterDb,
  pdfToPageImages,
} from '../test/helpers/interpretation.js';
import { benchmarkRegressionTest } from './benchmarking.js';

const { electionDefinition, precinctId } = vxFamousNamesFixtures;
let dbPath: string;
let db: ElectionPackageStore<ElectionPackageIncluding<'candidateOrderings'>>;

beforeAll(async () => {
  dbPath = await makeInterpreterDb(electionDefinition);
  db = ElectionPackageStore.fileStore(dbPath, {
    ballotPositions: false,
    ballots: false,
    candidateOrderings: true,
    uiStrings: false,
  });
});

afterAll(() => {
  db.close();
});

test('Blank BMD', async () => {
  const famousNamesBmdBallot = asSheet(
    await pdfToPageImages(
      await renderBmdBallotFixture({
        electionDefinition:
          electionFamousNames2021Fixtures.readElectionDefinition(),
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        votes: DEFAULT_FAMOUS_NAMES_VOTES,
      })
    ).toArray()
  );

  await benchmarkRegressionTest({
    label: 'BMD interpretation',
    func: async () => {
      await interpretSheet(
        {
          electionDefinition,
          validPrecinctIds: new Set([assertDefined(precinctId)]),
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
          dbPath,
        },
        (bs) => db.getCandidateOrderingsStore().getCandidateOrderings(bs),
        famousNamesBmdBallot
      );
    },
    runs: 50,
  });
});
