import { ElectionDefinition } from '@votingworks/types';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  getContestById,
  getPartyById,
  getBallotStyleById,
  getPrecinctById,
  getBallotStylesByPartyId,
  getBallotStylesByPrecinctId,
} from './lookups';

test('getPrecinctById', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  expect(getPrecinctById(electionDefinition, 'precinct-1').name).toEqual(
    'Precinct 1'
  );
  expect(getPrecinctById(electionDefinition, 'precinct-2').name).toEqual(
    'Precinct 2'
  );
  expect(
    () => getPrecinctById(electionDefinition, 'precinct-3').name
  ).toThrowError();

  // confirm that different elections are maintained separately
  const modifiedElectionDefinition: ElectionDefinition = {
    ...electionDefinition,
    electionHash: 'modified-election-hash',
    election: {
      ...electionDefinition.election,
      precincts: [
        {
          id: 'precinct-1',
          name: 'First Precinct',
        },
      ],
    },
  };

  expect(
    getPrecinctById(modifiedElectionDefinition, 'precinct-1').name
  ).toEqual('First Precinct');
  expect(getPrecinctById(electionDefinition, 'precinct-1').name).toEqual(
    'Precinct 1'
  );
});

test('getPartyById', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  expect(getPartyById(electionDefinition, '0').name).toEqual('Mammal');
  expect(getPartyById(electionDefinition, '1').name).toEqual('Fish');
  expect(() => getPartyById(electionDefinition, '2').name).toThrowError();
});

test('getContestById', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  expect(getContestById(electionDefinition, 'fishing').title).toEqual(
    'Ballot Measure 3'
  );
  expect(() => getContestById(electionDefinition, 'none').title).toThrowError();
});

test('getBallotStyleById', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  expect(getBallotStyleById(electionDefinition, '1M').partyId).toEqual('0');
  expect(getBallotStyleById(electionDefinition, '2F').partyId).toEqual('1');
  expect(() => getBallotStyleById(electionDefinition, '3D')).toThrowError();
});

test('getBallotStylesByPartyId', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  expect(
    getBallotStylesByPartyId(electionDefinition, '0').map((bs) => bs.id)
  ).toEqual(['1M']);
  expect(
    getBallotStylesByPartyId(electionDefinition, '1').map((bs) => bs.id)
  ).toEqual(['2F']);
});

test('getBallotStylesByPrecinct', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  expect(
    getBallotStylesByPrecinctId(electionDefinition, 'precinct-1').map(
      (bs) => bs.id
    )
  ).toEqual(['1M', '2F']);
  expect(
    getBallotStylesByPrecinctId(electionDefinition, 'precinct-2').map(
      (bs) => bs.id
    )
  ).toEqual(['1M', '2F']);
});
