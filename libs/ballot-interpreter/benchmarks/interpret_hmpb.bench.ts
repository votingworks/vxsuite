import { famousNamesFixtures } from '@votingworks/hmpb-render-backend';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { interpretSheet } from '../src';
import { ballotPdfToPageImages } from '../test/helpers/interpretation';
import { benchmarkRegressionTest } from './benchmarking';

jest.setTimeout(60_000);

describe('Interpretation benchmark', () => {
  const { electionDefinition, gridLayout, blankBallotPath, markedBallotPath } =
    famousNamesFixtures;
  const { precinctId } = gridLayout;

  test('Blank HMPB', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(blankBallotPath);
    assert(ballotImagePaths.length === 2);

    await benchmarkRegressionTest({
      label: 'Blank HMPB interpretation',
      func: async () => {
        await interpretSheet(
          {
            electionDefinition,
            precinctSelection: singlePrecinctSelectionFor(precinctId),
            testMode: true,
          },
          ballotImagePaths as [string, string]
        );
      },
      runs: 50,
    });
  });

  test('Marked HMPB', async () => {
    const ballotImagePaths = await ballotPdfToPageImages(markedBallotPath);
    assert(ballotImagePaths.length === 2);

    await benchmarkRegressionTest({
      label: 'Marked HMPB interpretation',
      func: async () => {
        await interpretSheet(
          {
            electionDefinition,
            precinctSelection: singlePrecinctSelectionFor(precinctId),
            testMode: true,
          },
          ballotImagePaths as [string, string]
        );
      },
      runs: 50,
    });
  });
});
