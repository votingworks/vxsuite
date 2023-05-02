import { assert } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { BallotPageMetadata, BallotType } from '@votingworks/types';
import { getBallotPageLayout, getContestsForBallotPage } from './page_layouts';

const { election } = electionGridLayoutNewHampshireAmherstFixtures;

const ballotPageMetadata: BallotPageMetadata = {
  electionHash: '0000000000', // fixed for resiliency to hash change
  precinctId: 'town-id-00701-precinct-id-',
  ballotStyleId: 'card-number-3',
  locales: { primary: 'en-US' },
  isTestMode: true,
  pageNumber: 1,
  ballotType: BallotType.Standard,
};

describe('getBallotPageLayout', () => {
  test('throws error if layout not found and not gridLayouts election', () => {
    assert(!electionMinimalExhaustiveSampleDefinition.election.gridLayouts);
    expect(() =>
      getBallotPageLayout({
        ballotPageMetadata,
        election: electionMinimalExhaustiveSampleDefinition.election,
      })
    ).toThrow();
  });

  test('finds layout if gridLayouts election', () => {
    const layout = getBallotPageLayout({
      ballotPageMetadata,
      election,
    });
    expect(layout).toBeDefined();
  });
});

test('getContestsForBallotPage', () => {
  const page1Contests = getContestsForBallotPage({
    ballotPageMetadata,
    election,
  });
  const page2Contests = getContestsForBallotPage({
    ballotPageMetadata: {
      ...ballotPageMetadata,
      pageNumber: 2,
    },
    election,
  });

  expect(page1Contests.map((contest) => contest.id)).toEqual([
    'Governor-061a401b',
    'United-States-Senator-d3f1c75b',
    'Representative-in-Congress-24683b44',
    'Executive-Councilor-bb22557f',
    'State-Senator-391381f8',
    'State-Representatives-Hillsborough-District-34-b1012d38',
    'State-Representative-Hillsborough-District-37-f3bde894',
  ]);
  expect(page2Contests.map((contest) => contest.id)).toEqual([
    'Sheriff-4243fe0b',
    'County-Attorney-133f910f',
    'County-Treasurer-87d25a31',
    'Register-of-Deeds-a1278df2',
    'Register-of-Probate-a4117da8',
    'County-Commissioner-d6feed25',
    'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
  ]);

  // Should throw error if page doesn't exist
  expect(() =>
    getContestsForBallotPage({
      ballotPageMetadata: {
        ...ballotPageMetadata,
        pageNumber: 3,
      },
      election,
    })
  ).toThrow();
});
