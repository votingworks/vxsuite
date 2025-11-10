import { expect, test, describe } from 'vitest';
import { ElectionDefinition } from '@votingworks/types';
import {
  electionPrimaryPrecinctSplitsFixtures,
  readElectionTwoPartyPrimaryDefinition,
  electionFamousNames2021Fixtures,
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
  const ballotStyleId = '2F'; // Fish party ballot style

  // Test a few key positions to verify the lookup works correctly
  expect(
    getOptionPosition(
      electionDefinition,
      ballotStyleId,
      'aquarium-council-fish',
      'manta-ray'
    )
  ).toEqual(0);
  expect(
    getOptionPosition(
      electionDefinition,
      ballotStyleId,
      'aquarium-council-fish',
      'pufferfish'
    )
  ).toEqual(1);
  expect(
    getOptionPosition(
      electionDefinition,
      ballotStyleId,
      'aquarium-council-fish',
      'write-in-0'
    )
  ).toEqual(4);
  expect(
    getOptionPosition(
      electionDefinition,
      ballotStyleId,
      'aquarium-council-fish',
      'write-in-1'
    )
  ).toEqual(5);

  // Test yes/no contest
  expect(
    getOptionPosition(
      electionDefinition,
      ballotStyleId,
      'fishing',
      'ban-fishing'
    )
  ).toEqual(0);
  expect(
    getOptionPosition(
      electionDefinition,
      ballotStyleId,
      'fishing',
      'allow-fishing'
    )
  ).toEqual(1);

  // Test contest with many write-ins
  expect(
    getOptionPosition(electionDefinition, '1M', 'zoo-council-mammal', 'zebra')
  ).toEqual(0);
  expect(
    getOptionPosition(
      electionDefinition,
      '1M',
      'zoo-council-mammal',
      'write-in-2'
    )
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
        ballotStyleId,
        'aquarium-council-fish',
        aquariumOptions[i]!
      )
    ).toEqual(i);
  }
});

describe('getOptionPosition with ballot-style-specific candidate rotation', () => {
  test('returns different positions for the same candidate in different ballot styles', () => {
    // Use the Famous Names election which has different candidate rotations per ballot style
    const electionDefinition =
      electionFamousNames2021Fixtures.baseElection_DEPRECATED.readElectionDefinition();
    const contestId = 'mayor';

    // Ballot style 1-1 has the order (from electionBase.json):
    // 1. sherlock-holmes (Democrat - party ID "0")
    // 2. sherlock-holmes (Liberty - party ID "2")
    // 3. thomas-edison (Republican - party ID "1")
    // For multi-endorsed candidates, we return the first occurrence (position 0)
    const ballotStyle11 = '1-1';
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle11,
        contestId,
        'sherlock-holmes'
      )
    ).toEqual(0); // First occurrence position
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle11,
        contestId,
        'thomas-edison'
      )
    ).toEqual(2); // After both sherlock-holmes entries

    // Ballot style 1-2 has a different order:
    // 1. sherlock-holmes (Liberty - party ID "2")
    // 2. thomas-edison (Republican - party ID "1")
    // 3. sherlock-holmes (Democrat - party ID "0")
    // For multi-endorsed candidates, we return the first occurrence (position 0)
    const ballotStyle12 = '1-2';
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle12,
        contestId,
        'sherlock-holmes'
      )
    ).toEqual(0); // First occurrence position
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle12,
        contestId,
        'thomas-edison'
      )
    ).toEqual(1);

    // Ballot style 1-4 has yet another order:
    // 1. thomas-edison (Republican - party ID "1")
    // 2. sherlock-holmes (Liberty - party ID "2")
    // 3. sherlock-holmes (Democrat - party ID "0")
    // For multi-endorsed candidates, we return the first occurrence (position 1)
    const ballotStyle14 = '1-4';
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle14,
        contestId,
        'thomas-edison'
      )
    ).toEqual(0);
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle14,
        contestId,
        'sherlock-holmes'
      )
    ).toEqual(1); // First occurrence position
  });

  test('returns different positions for multi-candidate contests with rotation', () => {
    const electionDefinition =
      electionFamousNames2021Fixtures.baseElection_DEPRECATED.readElectionDefinition();
    const contestId = 'attorney';

    // Ballot style 1-1 has the order:
    // 1. john-snow (Republican - party ID "1")
    // 2. mark-twain (Green - party ID "3")
    const ballotStyle11 = '1-1';
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle11,
        contestId,
        'john-snow'
      )
    ).toEqual(0);
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle11,
        contestId,
        'mark-twain'
      )
    ).toEqual(1);

    // Ballot style 1-2 has a different order:
    // 1. mark-twain (Green - party ID "3")
    // 2. john-snow (Republican - party ID "1")
    const ballotStyle12 = '1-2';
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle12,
        contestId,
        'mark-twain'
      )
    ).toEqual(0);
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle12,
        contestId,
        'john-snow'
      )
    ).toEqual(1);

    // Ballot style 1-4 has the same order as 1-2:
    // 1. mark-twain (Green - party ID "3")
    // 2. john-snow (Republican - party ID "1")
    const ballotStyle14 = '1-4';
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle14,
        contestId,
        'mark-twain'
      )
    ).toEqual(0);
    expect(
      getOptionPosition(
        electionDefinition,
        ballotStyle14,
        contestId,
        'john-snow'
      )
    ).toEqual(1);
  });

  test('write-in positions are after all candidates regardless of rotation', () => {
    const electionDefinition =
      electionFamousNames2021Fixtures.baseElection_DEPRECATED.readElectionDefinition();
    const contestId = 'attorney'; // 1-seat contest with 2 candidates

    // For all ballot styles, write-in-0 should be at position 2 (after 2 candidates)
    expect(
      getOptionPosition(electionDefinition, '1-1', contestId, 'write-in-0')
    ).toEqual(2);
    expect(
      getOptionPosition(electionDefinition, '1-2', contestId, 'write-in-0')
    ).toEqual(2);
    expect(
      getOptionPosition(electionDefinition, '1-4', contestId, 'write-in-0')
    ).toEqual(2);
  });

  test('caching works correctly across different ballot styles', () => {
    const electionDefinition =
      electionFamousNames2021Fixtures.baseElection_DEPRECATED.readElectionDefinition();
    const contestId = 'mayor';

    // Call multiple times to ensure caching doesn't cause issues
    const position1 = getOptionPosition(
      electionDefinition,
      '1-1',
      contestId,
      'thomas-edison'
    );
    const position2 = getOptionPosition(
      electionDefinition,
      '1-4',
      contestId,
      'thomas-edison'
    );
    const position3 = getOptionPosition(
      electionDefinition,
      '1-1',
      contestId,
      'thomas-edison'
    );

    expect(position1).toEqual(2); // position in ballot style 1-1 (after 2 sherlock-holmes entries)
    expect(position2).toEqual(0); // different position in ballot style 1-4 (first)
    expect(position3).toEqual(2); // should get cached value for 1-1
  });
});
