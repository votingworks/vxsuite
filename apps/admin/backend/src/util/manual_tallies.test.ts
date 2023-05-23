import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { buildSpecificManualTally } from '@votingworks/utils';
import { writeInCandidate as genericWriteInCandidate } from '@votingworks/types';
import { combineManualTallies } from './manual_tallies';
import { WriteInCandidateRecord } from '../types';

const electionDefinition = electionMinimalExhaustiveSampleDefinition;
const { election } = electionDefinition;
test('combineManualTallies', () => {
  const tally1 = buildSpecificManualTally(election, 10, {
    'best-animal-mammal': {
      overvotes: 1,
      undervotes: 0,
      ballots: 10,
      officialOptionTallies: {
        horse: 4,
        otter: 3,
        fox: 2,
      },
    },
    fishing: {
      overvotes: 1,
      undervotes: 1,
      ballots: 10,
      officialOptionTallies: {
        yes: 4,
        no: 4,
      },
    },
  });

  const tally2 = buildSpecificManualTally(election, 15, {
    'best-animal-mammal': {
      overvotes: 0,
      undervotes: 3,
      ballots: 15,
      officialOptionTallies: {
        horse: 1,
        otter: 9,
        fox: 0,
      },
      writeInOptionTallies: {
        chimera: {
          count: 2,
          candidate: {
            name: 'Chimera',
            id: 'chimera',
            isWriteIn: true,
          },
        },
      },
    },
    fishing: {
      overvotes: 0,
      undervotes: 5,
      ballots: 15,
      officialOptionTallies: {
        yes: 9,
        no: 1,
      },
    },
  });

  const tally3 = buildSpecificManualTally(election, 5, {
    'best-animal-mammal': {
      overvotes: 0,
      undervotes: 0,
      ballots: 5,
      officialOptionTallies: {
        horse: 1,
        otter: 1,
        fox: 1,
      },
      writeInOptionTallies: {
        rapidash: {
          count: 2,
          candidate: {
            name: 'Rapidash',
            id: 'rapidash',
            isWriteIn: true,
          },
        },
      },
    },
    fishing: {
      overvotes: 0,
      undervotes: 0,
      ballots: 5,
      officialOptionTallies: {
        yes: 4,
        no: 1,
      },
    },
  });

  const writeInCandidates: WriteInCandidateRecord[] = [
    {
      contestId: 'best-animal-mammal',
      electionId: 'uuid',
      id: 'chimera',
      name: 'Chimera',
    },
    {
      contestId: 'best-animal-mammal',
      electionId: 'uuid',
      id: 'rapidash',
      name: 'Rapidash',
    },
  ];

  // without merging write-ins
  expect(
    combineManualTallies({
      manualTallies: [tally1, tally2, tally3],
      election,
      writeInCandidates,
      mergeWriteIns: false,
    })
  ).toMatchObject(
    buildSpecificManualTally(election, 30, {
      'best-animal-mammal': {
        overvotes: 1,
        undervotes: 3,
        ballots: 30,
        officialOptionTallies: {
          horse: 6,
          otter: 13,
          fox: 3,
        },
        writeInOptionTallies: {
          rapidash: {
            count: 2,
            candidate: {
              name: 'Rapidash',
              id: 'rapidash',
              isWriteIn: true,
            },
          },
          chimera: {
            count: 2,
            candidate: {
              name: 'Chimera',
              id: 'chimera',
              isWriteIn: true,
            },
          },
        },
      },
      fishing: {
        overvotes: 1,
        undervotes: 6,
        ballots: 30,
        officialOptionTallies: {
          yes: 17,
          no: 6,
        },
      },
    })
  );

  // with merging write-ins
  expect(
    combineManualTallies({
      manualTallies: [tally1, tally2, tally3],
      election,
      writeInCandidates,
      mergeWriteIns: true,
    })
  ).toMatchObject(
    buildSpecificManualTally(election, 30, {
      'best-animal-mammal': {
        overvotes: 1,
        undervotes: 3,
        ballots: 30,
        officialOptionTallies: {
          horse: 6,
          otter: 13,
          fox: 3,
        },
        writeInOptionTallies: {
          [genericWriteInCandidate.id]: {
            count: 4,
            candidate: genericWriteInCandidate,
          },
        },
      },
      fishing: {
        overvotes: 1,
        undervotes: 6,
        ballots: 30,
        officialOptionTallies: {
          yes: 17,
          no: 6,
        },
      },
    })
  );

  // order independence, merging write-ins
  expect(
    combineManualTallies({
      manualTallies: [tally1, tally2, tally3],
      election,
      writeInCandidates,
      mergeWriteIns: true,
    })
  ).toEqual(
    combineManualTallies({
      manualTallies: [tally3, tally2, tally1],
      election,
      writeInCandidates,
      mergeWriteIns: true,
    })
  );

  // order independence, no merging write-ins
  expect(
    combineManualTallies({
      manualTallies: [tally1, tally2, tally3],
      election,
      writeInCandidates,
      mergeWriteIns: false,
    })
  ).toEqual(
    combineManualTallies({
      manualTallies: [tally3, tally2, tally1],
      election,
      writeInCandidates,
      mergeWriteIns: false,
    })
  );
});
