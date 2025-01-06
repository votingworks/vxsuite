import { expect, test } from 'vitest';
import {
  BallotStyleGroupId,
  ElectionDefinition,
  Tabulation,
} from '@votingworks/types';
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
  determinePartyId,
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

test('determinePartyId', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;

  const partyCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    partyId: '0',
    bmd: 1,
    hmpb: [1],
  };

  const ballotStyleCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
    bmd: 1,
    hmpb: [1],
  };

  const precinctCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    precinctId: 'precinct-1',
    bmd: 1,
    hmpb: [1],
  };

  expect(determinePartyId(electionDefinition, partyCardCounts)).toEqual('0');
  expect(determinePartyId(electionDefinition, ballotStyleCardCounts)).toEqual(
    '0'
  );
  expect(determinePartyId(electionDefinition, precinctCardCounts)).toEqual(
    undefined
  );
});

test('determinePartyId - multi language election', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();

  const partyCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    partyId: '0',
    bmd: 1,
    hmpb: [1],
  };

  const ballotStyleCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    ballotStyleGroupId: '1-Ma' as BallotStyleGroupId,
    bmd: 1,
    hmpb: [1],
  };

  const ballotStyleCardCounts2: Tabulation.GroupOf<Tabulation.CardCounts> = {
    ballotStyleGroupId: 'fake-ballot-style' as BallotStyleGroupId,
    bmd: 1,
    hmpb: [1],
  };

  const precinctCardCounts: Tabulation.GroupOf<Tabulation.CardCounts> = {
    precinctId: 'precinct-1',
    bmd: 1,
    hmpb: [1],
  };

  expect(determinePartyId(electionDefinition, partyCardCounts)).toEqual('0');
  expect(determinePartyId(electionDefinition, ballotStyleCardCounts)).toEqual(
    '0'
  );
  expect(determinePartyId(electionDefinition, precinctCardCounts)).toEqual(
    undefined
  );
  expect(determinePartyId(electionDefinition, ballotStyleCardCounts2)).toEqual(
    undefined
  );
});
