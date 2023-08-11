import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  AnyContest,
  DistrictId,
  ElectionDefinition,
  PartyId,
} from '@votingworks/types';

function buildContest(
  id: string,
  districtId: string,
  partyId?: string
): AnyContest {
  return {
    id,
    districtId: districtId as DistrictId,
    partyId: partyId as PartyId,
    title: 'Mock Contest',
    seats: 1,
    allowWriteIns: true,
    type: 'candidate',
    candidates: [],
  };
}

// election definition with more complex precinct & ballot style structure for testing
export const complexBallotStyleElectionDefinition: ElectionDefinition = {
  ...electionMinimalExhaustiveSampleDefinition,
  electionHash: 'extended-election-hash',
  election: {
    ...electionMinimalExhaustiveSampleDefinition.election,
    districts: [
      {
        id: 'congressional-1' as DistrictId,
        name: 'Congressional District 1',
      },
      {
        id: 'congressional-2' as DistrictId,
        name: 'Congressional District 2',
      },
      {
        id: 'town' as DistrictId,
        name: 'Town',
      },
      {
        id: 'water-1' as DistrictId,
        name: 'Water District 1',
      },
      {
        id: 'water-2' as DistrictId,
        name: 'Water District 2',
      },
    ],
    contests: [
      buildContest('congressional-1-mammal', 'congressional-1', '0'),
      buildContest('congressional-1-fish', 'congressional-1', '1'),
      buildContest('congressional-2-mammal', 'congressional-2', '0'),
      buildContest('congressional-2-fish', 'congressional-2', '1'),
      buildContest('town-mammal', 'town', '0'),
      buildContest('town-fish', 'town', '1'),
      buildContest('water-1-mammal', 'water-1', '0'),
      buildContest('water-1-fish', 'water-1', '1'),
      buildContest('water-2-mammal', 'water-2', '0'),
      buildContest('water-2-fish', 'water-2', '1'),
    ],
    precincts: [
      {
        id: 'c1-w1-1',
        name: 'Precinct 1',
      },
      {
        id: 'c1-w1-2',
        name: 'Precinct 2',
      },
      {
        id: 'c1-w2-1',
        name: 'Precinct 3',
      },
      {
        id: 'c2-w1-1',
        name: 'Precinct 4',
      },
      {
        id: 'c2-w2-1',
        name: 'Precinct 5',
      },
    ],
    ballotStyles: [
      {
        id: 'c1-w1-mammal',
        districts: ['town', 'congressional-1', 'water-1'] as DistrictId[],
        partyId: '0' as PartyId,
        precincts: ['c1-w1-1', 'c1-w1-2'],
      },
      {
        id: 'c1-w2-mammal',
        districts: ['town', 'congressional-1', 'water-2'] as DistrictId[],
        partyId: '0' as PartyId,
        precincts: ['c1-w2-1'],
      },
      {
        id: 'c2-w1-mammal',
        districts: ['town', 'congressional-2', 'water-1'] as DistrictId[],
        partyId: '0' as PartyId,
        precincts: ['c2-w1-1'],
      },
      {
        id: 'c2-w2-mammal',
        districts: ['town', 'congressional-2', 'water-2'] as DistrictId[],
        partyId: '0' as PartyId,
        precincts: ['c2-w2-1'],
      },
      {
        id: 'c1-w1-fish',
        districts: ['town', 'congressional-1', 'water-1'] as DistrictId[],
        partyId: '1' as PartyId,
        precincts: ['c1-w1-1', 'c1-w1-2'],
      },
      {
        id: 'c1-w2-fish',
        districts: ['town', 'congressional-1', 'water-2'] as DistrictId[],
        partyId: '1' as PartyId,
        precincts: ['c1-w2-1'],
      },
      {
        id: 'c2-w1-fish',
        districts: ['town', 'congressional-2', 'water-1'] as DistrictId[],
        partyId: '1' as PartyId,
        precincts: ['c2-w1-1'],
      },
      {
        id: 'c2-w2-fish',
        districts: ['town', 'congressional-2', 'water-2'] as DistrictId[],
        partyId: '1' as PartyId,
        precincts: ['c2-w2-1'],
      },
    ],
  },
};
