import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  buildManualResultsFixture,
  buildSpecificManualTally,
} from '@votingworks/utils';
import { convertResultsToDeprecatedTally } from './manual_tallies';

const electionDefinition = electionMinimalExhaustiveSampleDefinition;
const { election } = electionDefinition;

test('convertResultsToDeprecatedTally', () => {
  const manualResults = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      fishing: {
        type: 'yesno',
        ballots: 10,
        overvotes: 3,
        undervotes: 2,
        yesTally: 5,
        noTally: 0,
      },
      'zoo-council-mammal': {
        type: 'candidate',
        ballots: 10,
        overvotes: 3,
        undervotes: 2,
        officialOptionTallies: {
          zebra: 8,
          lion: 6,
          kangaroo: 7,
          elephant: 2,
        },
        writeInOptionTallies: {
          somebody: {
            id: 'somebody',
            name: 'Somebody',
            tally: 2,
          },
        },
      },
    },
  });

  const convertedManualResults = convertResultsToDeprecatedTally(
    election,
    manualResults
  );

  expect(convertedManualResults).toEqual(
    buildSpecificManualTally(election, 10, {
      fishing: {
        ballots: 10,
        overvotes: 3,
        undervotes: 2,
        officialOptionTallies: {
          yes: 5,
          no: 0,
        },
      },
      'zoo-council-mammal': {
        ballots: 10,
        overvotes: 3,
        undervotes: 2,
        officialOptionTallies: {
          zebra: 8,
          lion: 6,
          kangaroo: 7,
          elephant: 2,
        },
        writeInOptionTallies: {
          somebody: {
            candidate: {
              id: 'somebody',
              name: 'Somebody',
              isWriteIn: true,
            },
            count: 2,
          },
        },
      },
    })
  );
});
