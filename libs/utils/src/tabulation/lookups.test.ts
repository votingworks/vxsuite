import { expect, test } from 'vitest';
import { ElectionDefinition } from '@votingworks/types';
import {
  electionPrimaryPrecinctSplitsFixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  getContestById,
  getPartyById,
  getBallotStyleById,
  getParentBallotStyleById,
  getPrecinctById,
  getBallotStylesByPartyId,
  getBallotStylesByPrecinctId,
  getOptionPosition,
} from './lookups';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

test('getPrecinctById', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
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
    ballotHash: 'modified-ballot-hash',
    election: {
      ...electionDefinition.election,
      precincts: [
        {
          id: 'precinct-1',
          name: 'First Precinct',
          districtIds: [electionDefinition.election.districts[0]!.id],
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
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  expect(getPartyById(electionDefinition, '0').name).toEqual('Mammal');
  expect(getPartyById(electionDefinition, '1').name).toEqual('Fish');
  expect(() => getPartyById(electionDefinition, '2').name).toThrowError();
});

test('getContestById', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  expect(getContestById(electionDefinition, 'fishing').title).toEqual(
    'Ballot Measure 3'
  );
  expect(() => getContestById(electionDefinition, 'none').title).toThrowError();
});

test('getBallotStyleById', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  expect(getBallotStyleById(electionDefinition, '1M').partyId).toEqual('0');
  expect(getBallotStyleById(electionDefinition, '2F').partyId).toEqual('1');
  expect(() => getBallotStyleById(electionDefinition, '3D')).toThrowError();

  const multiLangElectionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  expect(
    getBallotStyleById(multiLangElectionDefinition, '1-Ma_en').partyId
  ).toEqual('0');
  expect(
    () => getBallotStyleById(multiLangElectionDefinition, '1-Ma').partyId
  ).toThrowError();
});

test('getParentBallotStyleById', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  expect(getParentBallotStyleById(electionDefinition, '1-Ma').partyId).toEqual(
    '0'
  );
  expect(getParentBallotStyleById(electionDefinition, '2-F').partyId).toEqual(
    '1'
  );
  expect(() =>
    getParentBallotStyleById(electionDefinition, '1-Ma_en')
  ).toThrowError();
});

test('getBallotStylesByPartyId', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  expect(
    getBallotStylesByPartyId(electionDefinition, '0').map((bs) => bs.id)
  ).toEqual(['1M']);
  expect(
    getBallotStylesByPartyId(electionDefinition, '1').map((bs) => bs.id)
  ).toEqual(['2F']);
});

test('getBallotStylesByPrecinct', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
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

test('getOptionPosition returns correct positions for all contest options', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  // Test a few key positions to verify the lookup works correctly
  expect(
    getOptionPosition(electionDefinition, 'aquarium-council-fish', 'manta-ray')
  ).toEqual(0);
  expect(
    getOptionPosition(electionDefinition, 'aquarium-council-fish', 'pufferfish')
  ).toEqual(1);
  expect(
    getOptionPosition(electionDefinition, 'aquarium-council-fish', 'write-in-0')
  ).toEqual(4);
  expect(
    getOptionPosition(electionDefinition, 'aquarium-council-fish', 'write-in-1')
  ).toEqual(5);

  // Test yes/no contest
  expect(
    getOptionPosition(electionDefinition, 'fishing', 'ban-fishing')
  ).toEqual(0);
  expect(
    getOptionPosition(electionDefinition, 'fishing', 'allow-fishing')
  ).toEqual(1);

  // Test contest with many write-ins
  expect(
    getOptionPosition(electionDefinition, 'zoo-council-mammal', 'zebra')
  ).toEqual(0);
  expect(
    getOptionPosition(electionDefinition, 'zoo-council-mammal', 'write-in-2')
  ).toEqual(6);

  // Verify full structure by checking all options for a contest
  const aquariumOptions = [
    'manta-ray',
    'pufferfish',
    'rockfish',
    'triggerfish',
    'write-in-0',
    'write-in-1',
  ];
  for (let i = 0; i < aquariumOptions.length; i += 1) {
    expect(
      getOptionPosition(
        electionDefinition,
        'aquarium-council-fish',
        aquariumOptions[i]!
      )
    ).toEqual(i);
  }
});
