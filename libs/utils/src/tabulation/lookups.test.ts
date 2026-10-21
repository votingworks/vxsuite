import { expect, test, describe } from 'vitest';
import {
  NO_CANDIDATE_ORDERINGS,
  type CandidateContest,
  type CandidateOrderings,
  type Contest,
  type Election,
  type ElectionDefinition,
  type OptionalCandidateOrderings,
  type StraightPartyContest,
  type YesNoContest,
} from '@votingworks/types';
import {
  electionPrimaryPrecinctSplitsFixtures,
  readElectionTwoPartyPrimaryDefinition,
  electionFamousNames2021Fixtures,
  electionStraightPartyFixtures,
} from '@votingworks/fixtures';
import { assert, find } from '@votingworks/basics';
import {
  getContestById,
  getPartyById,
  getPollingPlaceById,
  getBallotStyleById,
  getParentBallotStyleById,
  getPrecinctById,
  getBallotStylesByPartyId,
  getBallotStylesByPrecinctId,
  getOptionPosition,
} from './lookups.js';

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

test('getPollingPlaceById', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  expect(
    getPollingPlaceById(electionDefinition, 'precinct-1-polling-place').name
  ).toEqual('Precinct 1');
  expect(
    getPollingPlaceById(electionDefinition, 'precinct-2-polling-place').name
  ).toEqual('Precinct 2');
  expect(() =>
    getPollingPlaceById(electionDefinition, 'nonexistent-polling-place')
  ).toThrowError();
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
  const { election } = electionTwoPartyPrimaryDefinition;

  const contestAquariumCouncil = assertFindContest({
    election,
    id: 'aquarium-council-fish',
  });

  const contestFishing = assertFindContest({
    election,
    id: 'fishing',
  });

  const contestZooCouncil = assertFindContest({
    election,
    id: 'zoo-council-mammal',
  });

  // Test a few key positions to verify the lookup works correctly
  expect(
    getOptionPosition(
      NO_CANDIDATE_ORDERINGS,
      contestAquariumCouncil,
      'manta-ray'
    )
  ).toEqual(0);
  expect(
    getOptionPosition(
      NO_CANDIDATE_ORDERINGS,
      contestAquariumCouncil,
      'pufferfish'
    )
  ).toEqual(1);
  expect(
    getOptionPosition(
      NO_CANDIDATE_ORDERINGS,
      contestAquariumCouncil,
      'write-in-0'
    )
  ).toEqual(4);
  expect(
    getOptionPosition(
      NO_CANDIDATE_ORDERINGS,
      contestAquariumCouncil,
      'write-in-1'
    )
  ).toEqual(5);

  // Test yes/no contest
  expect(
    getOptionPosition(NO_CANDIDATE_ORDERINGS, contestFishing, 'ban-fishing')
  ).toEqual(0);
  expect(
    getOptionPosition(NO_CANDIDATE_ORDERINGS, contestFishing, 'allow-fishing')
  ).toEqual(1);

  // Test contest with many write-ins
  expect(
    getOptionPosition(NO_CANDIDATE_ORDERINGS, contestZooCouncil, 'zebra')
  ).toEqual(0);
  expect(
    getOptionPosition(NO_CANDIDATE_ORDERINGS, contestZooCouncil, 'write-in-2')
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
        NO_CANDIDATE_ORDERINGS,
        contestAquariumCouncil,
        aquariumOptions[i]!
      )
    ).toEqual(i);
  }
});

test('getOptionPosition throws on invalid option IDs', () => {
  const fixtures = electionStraightPartyFixtures;
  const election = fixtures.readElection();

  const candidateContest: CandidateContest = {
    ...find<Contest, CandidateContest>(
      election.contests,
      (c) => c.type === 'candidate'
    ),
    allowWriteIns: true,
  };
  const ballotMeasure = find<Contest, YesNoContest>(
    election.contests,
    (c) => c.type === 'yesno'
  );
  const straightPartyContest = find<Contest, StraightPartyContest>(
    election.contests,
    (c) => c.type === 'straight-party'
  );

  expectThrows({
    contest: ballotMeasure,
    optionId: 'invalid-1',
    msg: /option invalid-1 not in contest/,
  });

  expectThrows({
    contest: straightPartyContest,
    optionId: 'invalid-1',
    msg: /option invalid-1 not in contest/,
  });

  expectThrows({
    contest: candidateContest,
    optionId: 'invalid-1',
    msg: /candidate invalid-1 not in contest/,
  });

  for (const optionId of ['write-in-1a', 'write-in-aa', 'write-in-']) {
    expectThrows({
      contest: candidateContest,
      optionId,
      msg: /invalid write-in ID/,
    });
  }

  expectThrows({
    contest: candidateContest,
    optionId: 'write-in-101',
    msg: /write-in index out of bounds/,
  });

  function expectThrows(p: {
    contest: Contest;
    optionId: string;
    msg: string | RegExp;
  }) {
    expect(() =>
      getOptionPosition(NO_CANDIDATE_ORDERINGS, p.contest, p.optionId)
    ).toThrow(p.msg);
  }
});

describe('getOptionPosition with ballot-style-specific candidate rotation', () => {
  const fixtures = electionFamousNames2021Fixtures;
  const election = fixtures.readElection();
  const contest = assertFindContest({ election, id: 'mayor' });
  assert(contest.type === 'candidate');

  function position(
    orderings: OptionalCandidateOrderings,
    candidateId: string
  ) {
    return getOptionPosition(orderings, contest, candidateId);
  }

  const order1: CandidateOrderings = {
    [contest.id]: [
      { id: 'sherlock-holmes', partyIds: ['0'] },
      { id: 'sherlock-holmes', partyIds: ['2'] },
      { id: 'thomas-edison', partyIds: ['1'] },
    ],
  };

  const order2: CandidateOrderings = {
    [contest.id]: [
      { id: 'thomas-edison', partyIds: ['1'] },
      { id: 'sherlock-holmes', partyIds: ['2'] },
      { id: 'sherlock-holmes', partyIds: ['0'] },
    ],
  };

  const order3: CandidateOrderings = {
    [contest.id]: [
      { id: 'thomas-edison', partyIds: ['1'] },
      { id: 'sherlock-holmes', partyIds: ['2'] },
    ],
  };

  test('returns candidate positions based on ballot style ordering', () => {
    expect(position(order1, 'sherlock-holmes')).toEqual(0);
    expect(position(order1, 'thomas-edison')).toEqual(2);

    expect(position(order2, 'sherlock-holmes')).toEqual(1);
    expect(position(order2, 'thomas-edison')).toEqual(0);
  });

  test('write-in positions are after all candidates regardless of rotation', () => {
    expect(position(order1, 'write-in-0')).toEqual(3);
    expect(position(order2, 'write-in-0')).toEqual(3);
    expect(position(order3, 'write-in-0')).toEqual(2);
  });

  test('throws on invalid option IDs', () => {
    expectThrows({
      optionId: 'invalid-1',
      msg: /candidate invalid-1 not in contest/,
    });

    for (const optionId of ['write-in-1a', 'write-in-aa', 'write-in-']) {
      expectThrows({ optionId, msg: /invalid write-in ID/ });
    }

    expectThrows({
      optionId: 'write-in-101',
      msg: /write-in index out of bounds/,
    });

    function expectThrows(p: { optionId: string; msg: string | RegExp }) {
      expect(() => getOptionPosition(order1, contest, p.optionId)).toThrow(
        p.msg
      );
    }
  });
});

function assertFindContest(p: { election: Election; id: string }) {
  return find(p.election.contests, (c) => c.id === p.id);
}
