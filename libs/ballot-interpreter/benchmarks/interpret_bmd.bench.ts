import { describe, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { famousNamesFixtures } from '@votingworks/hmpb';
import { asSheet, DEFAULT_MARK_THRESHOLDS } from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { interpretSheet } from '../src';
import { pdfToPageImages } from '../test/helpers/interpretation';
import { benchmarkRegressionTest } from './benchmarking';

describe('Interpretation benchmark', () => {
  const { electionDefinition, precinctId } = famousNamesFixtures;

  test('Blank HMPB', async () => {
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
            precinctSelection: singlePrecinctSelectionFor(
              assertDefined(precinctId)
            ),
            testMode: true,
            markThresholds: DEFAULT_MARK_THRESHOLDS,
            adjudicationReasons: [],
          },
          famousNamesBmdBallot
        );
      },
      runs: 50,
    });
  });
});
