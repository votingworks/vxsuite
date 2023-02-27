import { ok } from '@votingworks/basics';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  BallotPageLayout,
  BallotPageMetadata,
  BallotType,
} from '@votingworks/types';
import { getBallotPageLayout, getContestsForBallotPage } from './page_layouts';

const { election } = electionMinimalExhaustiveSampleDefinition;

/**
 * Ballot Page Layouts Mock
 */
export const mockBallotPageLayouts = [
  {
    name: 'mockPageLayout',
    metadata: {
      pageNumber: 1,
      ballotStyleId: '2F',
    },
    contests: [0, 1],
  },
  {
    metadata: {
      pageNumber: 2,
      ballotStyleId: '2F',
    },
    contests: [2],
  },
] as unknown as BallotPageLayout[];

jest.mock('@votingworks/ballot-interpreter-nh', () => ({
  ...jest.requireActual('@votingworks/ballot-interpreter-nh'),
  generateBallotPageLayouts: () => ok(mockBallotPageLayouts),
}));

const ballotPageMetadata: BallotPageMetadata = {
  electionHash: '0000000000', // fixed for resiliency to hash change'
  precinctId: 'precinct-1',
  ballotStyleId: '2F',
  locales: { primary: 'en-US' },
  isTestMode: true,
  pageNumber: 1,
  ballotType: BallotType.Standard,
};

describe('getBallotPageLayout', () => {
  test('throws error if layout not found and not gridLayouts election', () => {
    expect(() =>
      getBallotPageLayout({
        ballotPageMetadata,
        ballotPageLayoutsLookup: [],
        election,
      })
    ).toThrow();
  });

  test('generates layout if layout not found and is gridLayouts election', () => {
    expect(
      getBallotPageLayout({
        ballotPageMetadata,
        ballotPageLayoutsLookup: [],
        election: {
          ...election,
          gridLayouts: [],
        },
      })
    ).toMatchObject({
      name: 'mockPageLayout',
    });
  });

  test('find layout in lookup table if exists', () => {
    expect(
      getBallotPageLayout({
        ballotPageMetadata,
        ballotPageLayoutsLookup: [
          {
            ballotMetadata: ballotPageMetadata,
            ballotPageLayouts: mockBallotPageLayouts,
          },
        ],
        election,
      })
    ).toMatchObject({
      name: 'mockPageLayout',
    });
  });
});

test('getContestsForBallotPage', () => {
  const page1Contests = getContestsForBallotPage({
    ballotPageMetadata,
    ballotPageLayoutsLookup: [
      {
        ballotMetadata: ballotPageMetadata,
        ballotPageLayouts: mockBallotPageLayouts,
      },
    ],
    election,
  });
  const page2Contests = getContestsForBallotPage({
    ballotPageMetadata: {
      ...ballotPageMetadata,
      pageNumber: 2,
    },
    ballotPageLayoutsLookup: [
      {
        ballotMetadata: ballotPageMetadata,
        ballotPageLayouts: mockBallotPageLayouts,
      },
    ],
    election,
  });

  // Should have first and second contest in election definition
  expect(page1Contests.map((contest) => contest.id)).toEqual([
    'best-animal-fish',
    'aquarium-council-fish',
  ]);
  // Should have third contest in election definition
  expect(page2Contests.map((contest) => contest.id)).toEqual([
    'new-zoo-either',
  ]);

  // Should throw error if page doesn't exist
  expect(() =>
    getContestsForBallotPage({
      ballotPageMetadata: {
        ...ballotPageMetadata,
        pageNumber: 3,
      },
      ballotPageLayoutsLookup: [
        {
          ballotMetadata: ballotPageMetadata,
          ballotPageLayouts: mockBallotPageLayouts,
        },
      ],
      election,
    })
  ).toThrow();
});
