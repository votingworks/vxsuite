import { asElectionDefinition } from '@votingworks/fixtures';
import {
  BallotType,
  DistrictIdSchema,
  Election,
  unsafeParse,
} from '@votingworks/types';
import { encodeBallot, encodeHmpbBallotPageMetadata } from '.';

const district1Id = unsafeParse(DistrictIdSchema, 'district1');
const election: Election = {
  title: 'Election',
  county: { id: 'nowhere', name: 'Nowhere' },
  state: 'Nowhere',
  date: '1989-06-23T00:00:00Z',
  districts: [{ id: district1Id, name: 'District 1' }],
  parties: [],
  precincts: [{ id: 'precinct1', name: 'Precinct 1' }],
  ballotStyles: [
    { id: 'style1', districts: [district1Id], precincts: ['precinct1'] },
  ],
  contests: [
    {
      type: 'yesno',
      id: 'contest1',
      districtId: district1Id,
      title: 'Ever dance with the devil in the pale moonlight?',
      description: 'See ya round, kid.',
      section: 'DC',
    },
  ],
};
const { electionHash } = asElectionDefinition(election);

test('BMD: smallest possible encoded ballot', () => {
  expect(
    encodeBallot(election, {
      electionHash,
      ballotStyleId: election.ballotStyles[0]!.id,
      precinctId: election.precincts[0]!.id,
      ballotType: BallotType.Standard,
      isTestMode: true,
      votes: {},
    }).byteLength
  ).toEqual(18);
});

test('HMPB: smallest possible encoded metadata', () => {
  expect(
    encodeHmpbBallotPageMetadata(election, {
      electionHash: electionHash.slice(0, 20),
      ballotStyleId: 'style1',
      precinctId: 'precinct1',
      ballotType: BallotType.Standard,
      isTestMode: true,
      locales: { primary: 'en-US' },
      pageNumber: 1,
    }).byteLength
  ).toEqual(20);
});
