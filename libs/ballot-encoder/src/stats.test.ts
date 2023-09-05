import { asElectionDefinition } from '@votingworks/fixtures';
import {
  BallotPaperSize,
  BallotType,
  DistrictIdSchema,
  Election,
  unsafeParse,
} from '@votingworks/types';
import { encodeBallot } from '.';

const district1Id = unsafeParse(DistrictIdSchema, 'district1');
const election: Election = {
  type: 'general',
  title: 'Election',
  county: { id: 'nowhere', name: 'Nowhere' },
  state: 'Nowhere',
  date: '1989-06-23T00:00:00Z',
  seal: '<svg>test seal</svg>',
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
      yesOption: { id: 'contest1-option-yes', label: 'Yes' },
      noOption: { id: 'contest1-option-no', label: 'No' },
    },
  ],
  ballotLayout: {
    paperSize: BallotPaperSize.Letter,
    metadataEncoding: 'qr-code',
  },
};
const { electionHash } = asElectionDefinition(election);

test('smallest possible encoded ballot', () => {
  expect(
    encodeBallot(election, {
      electionHash,
      ballotStyleId: election.ballotStyles[0]!.id,
      precinctId: election.precincts[0]!.id,
      ballotType: BallotType.Precinct,
      isTestMode: true,
      votes: {},
    }).byteLength
  ).toEqual(18);
});
