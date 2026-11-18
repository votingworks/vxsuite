import { expect, test } from 'vitest';
import {
  electionGeneralFixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import type { Election } from '@votingworks/types';
import { hasValidRegisteredVoterCountParties } from './registered_voter_counts.js';

const election = electionPrimaryPrecinctSplitsFixtures.readElection();
const electionGeneral = electionGeneralFixtures.readElection();
const generalPrecinctId = electionGeneral.precincts[0]!.id;

const electionWithoutParty1InPrecinctC1W2: Election = {
  ...election,
  ballotStyles: election.ballotStyles.map((ballotStyle) =>
    ballotStyle.partyId === '1'
      ? {
          ...ballotStyle,
          precincts: ballotStyle.precincts.filter(
            (precinctId) => precinctId !== 'precinct-c1-w2'
          ),
        }
      : ballotStyle
  ),
};

test('accepts counts without party breakdowns', () => {
  expect(
    hasValidRegisteredVoterCountParties(election, {
      'precinct-c1-w1-1': 100,
      'precinct-c1-w1-2': { total: 100 },
      'precinct-c2': { splits: { 'precinct-c2-split-1': 100 } },
    })
  ).toEqual(true);
});

test('accepts breakdowns with every ballot-style party', () => {
  expect(
    hasValidRegisteredVoterCountParties(election, {
      'precinct-c1-w1-1': {
        total: 35,
        byParty: { 0: 10, 1: 20 },
        nonpartisan: 5,
      },
      'precinct-c2': {
        splits: {
          'precinct-c2-split-1': { total: 30, byParty: { 0: 0, 1: 30 } },
          'precinct-c2-split-2': 100,
        },
      },
    })
  ).toEqual(true);
});

test('rejects breakdowns missing a ballot-style party', () => {
  expect(
    hasValidRegisteredVoterCountParties(election, {
      'precinct-c1-w1-1': { total: 10, byParty: { 0: 10 } },
    })
  ).toEqual(false);
  expect(
    hasValidRegisteredVoterCountParties(election, {
      'precinct-c2': {
        splits: { 'precinct-c2-split-2': { total: 10, byParty: { 1: 10 } } },
      },
    })
  ).toEqual(false);
});

test('rejects breakdowns with a party that has no ballot style there', () => {
  expect(
    hasValidRegisteredVoterCountParties(election, {
      'precinct-c1-w1-1': {
        total: 30,
        byParty: { 0: 10, 1: 10, unknown: 10 },
      },
    })
  ).toEqual(false);
  expect(
    hasValidRegisteredVoterCountParties(electionWithoutParty1InPrecinctC1W2, {
      'precinct-c1-w2': { total: 30, byParty: { 0: 10, 1: 20 } },
    })
  ).toEqual(false);
});

test('checks each precinct against its own ballot-style parties', () => {
  expect(
    hasValidRegisteredVoterCountParties(electionWithoutParty1InPrecinctC1W2, {
      'precinct-c1-w1-1': { total: 30, byParty: { 0: 10, 1: 20 } },
      'precinct-c1-w2': { total: 10, byParty: { 0: 10 } },
    })
  ).toEqual(true);
});

test('rejects breakdowns in a general election', () => {
  expect(
    hasValidRegisteredVoterCountParties(electionGeneral, {
      [generalPrecinctId]: { total: 10, byParty: { 0: 10 } },
    })
  ).toEqual(false);
  expect(
    hasValidRegisteredVoterCountParties(electionGeneral, {
      [generalPrecinctId]: {
        total: 10,
        byParty: {},
        nonpartisan: 10,
      },
    })
  ).toEqual(true);
});
