import { assertDefined } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { famousNamesFixtures } from '@votingworks/hmpb';
import {
  asSheet,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
} from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { interpretSheet } from '../src';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { benchmarkRegressionTest } from './benchmarking';

jest.setTimeout(60_000);

describe('Interpretation benchmark', () => {
  const { electionPath, precinctId, blankBallotPath, markedBallotPath } =
    famousNamesFixtures;
  let electionDefinition: ElectionDefinition;
  beforeAll(async () => {
    electionDefinition = (await readElection(electionPath)).unsafeUnwrap();
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
            precinctSelection: singlePrecinctSelectionFor(
              assertDefined(precinctId)
            ),
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
            precinctSelection: singlePrecinctSelectionFor(
              assertDefined(precinctId)
            ),
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
});
