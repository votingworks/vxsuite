import { afterAll, beforeAll, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { asSheet, DEFAULT_MARK_THRESHOLDS } from '@votingworks/types';
import {
  ElectionPackageStore,
  type ElectionPackageIncluding,
} from '@votingworks/backend';
import { interpretSheet } from '../src/index.js';
import {
  makeInterpreterDb,
  pdfToPageImages,
} from '../test/helpers/interpretation.js';
import { benchmarkRegressionTest } from './benchmarking.js';

const { electionDefinition, precinctId, blankBallotPath, markedBallotPath } =
  vxFamousNamesFixtures;
const validPrecinctIds = new Set([assertDefined(precinctId)]);
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

test('Blank HMPB', async () => {
  const ballotImages = asSheet(
    await pdfToPageImages(blankBallotPath).toArray()
  );

  await benchmarkRegressionTest({
    label: 'Blank HMPB interpretation',
    func: async () => {
      await interpretSheet(
        {
          electionDefinition,
          validPrecinctIds,
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
          dbPath,
        },
        (bs) => db.getCandidateOrderingsStore().getCandidateOrderings(bs),
        ballotImages
      );
    },
    runs: 50,
  });
});

test('Marked HMPB', async () => {
  const ballotImages = asSheet(
    await pdfToPageImages(markedBallotPath).toArray()
  );

  await benchmarkRegressionTest({
    label: 'Marked HMPB interpretation',
    func: async () => {
      await interpretSheet(
        {
          electionDefinition,
          validPrecinctIds,
          testMode: true,
          markThresholds: DEFAULT_MARK_THRESHOLDS,
          adjudicationReasons: [],
          dbPath,
        },
        (bs) => db.getCandidateOrderingsStore().getCandidateOrderings(bs),
        ballotImages
      );
    },
    runs: 50,
  });
});
