import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { BallotPageMetadata, BallotType } from '@votingworks/types';
import { getContestsForBallotPage } from './page_layouts';

const { election } = electionGridLayoutNewHampshireAmherstFixtures;

const ballotPageMetadata: BallotPageMetadata = {
  electionHash: '0000000000', // fixed for resiliency to hash change
  precinctId: 'town-id-00701-precinct-id-',
  ballotStyleId: 'card-number-3',
  isTestMode: true,
  pageNumber: 1,
  ballotType: BallotType.Precinct,
};

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
});
