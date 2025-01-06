import { expect, test } from 'vitest';
import { asElectionDefinition } from '@votingworks/fixtures';
import {
  HmpbBallotPaperSize,
  BallotStyleGroupId,
  BallotStyleId,
  BallotType,
  DistrictIdSchema,
  Election,
  ElectionIdSchema,
  unsafeParse,
} from '@votingworks/types';
import { DateWithoutTime } from '@votingworks/basics';
import { encodeBallot } from '.';

const district1Id = unsafeParse(DistrictIdSchema, 'district1');
const electionId = unsafeParse(ElectionIdSchema, 'election-1');
const election: Election = {
  id: electionId,
  type: 'general',
  title: 'Election',
  county: { id: 'nowhere', name: 'Nowhere' },
  state: 'Nowhere',
  date: new DateWithoutTime('1989-06-23'),
  seal: '<svg>test seal</svg>',
  districts: [{ id: district1Id, name: 'District 1' }],
  parties: [],
  precincts: [{ id: 'precinct1', name: 'Precinct 1' }],
  ballotStyles: [
    {
      id: 'style1_en' as BallotStyleId,
      groupId: 'style1' as BallotStyleGroupId,
      districts: [district1Id],
      precincts: ['precinct1'],
    },
  ],
  contests: [
    {
      type: 'yesno',
      id: 'contest1',
      districtId: district1Id,
      title: 'Ever dance with the devil in the pale moonlight?',
      description: 'See ya round, kid.',
      yesOption: { id: 'contest1-option-yes', label: 'Yes' },
      noOption: { id: 'contest1-option-no', label: 'No' },
    },
  ],
  ballotLayout: {
    paperSize: HmpbBallotPaperSize.Letter,
    metadataEncoding: 'qr-code',
  },
  ballotStrings: {},
};
const { ballotHash } = asElectionDefinition(election);

test('smallest possible encoded ballot', () => {
  expect(
    encodeBallot(election, {
      ballotHash,
      ballotStyleId: election.ballotStyles[0]!.id,
      precinctId: election.precincts[0]!.id,
      ballotType: BallotType.Precinct,
      isTestMode: true,
      votes: {},
    }).byteLength
  ).toEqual(18);
});
