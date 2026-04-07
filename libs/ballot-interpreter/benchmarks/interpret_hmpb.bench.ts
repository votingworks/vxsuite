import { test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { asSheet, DEFAULT_MARK_THRESHOLDS } from '@votingworks/types';
import { interpretSheet } from '../src';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { benchmarkRegressionTest } from './benchmarking';

const { electionDefinition, precinctId, blankBallotPath, markedBallotPath } =
  vxFamousNamesFixtures;
const validPrecinctIds = new Set([assertDefined(precinctId)]);

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
        },
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
        },
        ballotImages
      );
    },
    runs: 50,
  });
});
