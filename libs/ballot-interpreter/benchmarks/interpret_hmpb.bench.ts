import { assert, assertDefined } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import { famousNamesFixtures } from '@votingworks/hmpb';
import {
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
} from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { interpretSheet } from '../src';
import { benchmarkRegressionTest } from './benchmarking';
import { pdfToPageImagePaths } from '../test/helpers/interpretation';

jest.setTimeout(60_000);

describe('Interpretation benchmark', () => {
  const { electionPath, precinctId, blankBallotPath, markedBallotPath } =
    famousNamesFixtures;
  let electionDefinition: ElectionDefinition;
  beforeAll(async () => {
    electionDefinition = (await readElection(electionPath)).unsafeUnwrap();
  });

  test('Blank HMPB', async () => {
    const ballotImagePaths = await pdfToPageImagePaths(blankBallotPath);
    assert(ballotImagePaths.length === 2);

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
          ballotImagePaths as [string, string]
        );
      },
      runs: 50,
    });
  });

  test('Marked HMPB', async () => {
    const ballotImagePaths = await pdfToPageImagePaths(markedBallotPath);
    assert(ballotImagePaths.length === 2);

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
          ballotImagePaths as [string, string]
        );
      },
      runs: 50,
    });
  });
});
