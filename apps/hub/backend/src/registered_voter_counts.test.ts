import { expect, test } from 'vitest';
import {
  electionGeneralFixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import type {
  ElectionRegisteredVoterCounts,
  Precinct,
} from '@votingworks/types';
import {
  findRegisteredVoterCountBreakdownError,
  getRegisteredVoterCountBreakdownConfig,
  type RegisteredVoterCountBreakdownConfig,
} from './registered_voter_counts.js';
import { nhJurisdiction, nonVxJurisdiction } from '../test/mocks.js';
import { enableStateFeaturesForTest } from '../test/helpers.js';

const primaryElection = electionPrimaryPrecinctSplitsFixtures.readElection();
const generalElection = electionGeneralFixtures.readElection();

test('getRegisteredVoterCountBreakdownConfig', () => {
  expect(
    getRegisteredVoterCountBreakdownConfig(nonVxJurisdiction, primaryElection)
  ).toEqual({ byParty: false, nonpartisan: false });

  enableStateFeaturesForTest(nonVxJurisdiction.stateCode, {
    REGISTERED_VOTER_COUNTS_BY_PARTY: true,
  });
  expect(
    getRegisteredVoterCountBreakdownConfig(nonVxJurisdiction, primaryElection)
  ).toEqual({ byParty: true, nonpartisan: false });

  enableStateFeaturesForTest(nonVxJurisdiction.stateCode, {
    NONPARTISAN_REGISTERED_VOTER_COUNT: true,
  });
  expect(
    getRegisteredVoterCountBreakdownConfig(nonVxJurisdiction, primaryElection)
  ).toEqual({ byParty: true, nonpartisan: true });
  expect(
    getRegisteredVoterCountBreakdownConfig(
      { ...nonVxJurisdiction, softwareVersion: 'v4.0' },
      primaryElection
    )
  ).toEqual({ byParty: false, nonpartisan: false });
  expect(
    getRegisteredVoterCountBreakdownConfig(nonVxJurisdiction, generalElection)
  ).toEqual({ byParty: false, nonpartisan: false });
  expect(
    getRegisteredVoterCountBreakdownConfig(nhJurisdiction, primaryElection)
  ).toEqual({ byParty: false, nonpartisan: false });
});

const precincts: Precinct[] = [
  { id: 'p1', name: 'Precinct 1', districtIds: [] },
  {
    id: 'p2',
    name: 'Precinct 2',
    splits: [{ id: 's1', name: 'Split 1', districtIds: [] }],
  },
];

const NONE: RegisteredVoterCountBreakdownConfig = {
  byParty: false,
  nonpartisan: false,
};
const BY_PARTY: RegisteredVoterCountBreakdownConfig = {
  byParty: true,
  nonpartisan: false,
};
const BY_PARTY_AND_NONPARTISAN: RegisteredVoterCountBreakdownConfig = {
  byParty: true,
  nonpartisan: true,
};

const totals: ElectionRegisteredVoterCounts = {
  p1: { total: 10 },
  p2: { splits: { s1: { total: 20 } } },
};
const byParty: ElectionRegisteredVoterCounts = {
  p1: { total: 10, byParty: { dem: 10 } },
  p2: { splits: { s1: { total: 20, byParty: { dem: 20 } } } },
};
const byPartyAndNonpartisan: ElectionRegisteredVoterCounts = {
  p1: { total: 10, byParty: { dem: 5 }, nonpartisan: 5 },
  p2: { splits: { s1: { total: 20, byParty: { dem: 15 }, nonpartisan: 5 } } },
};

test('findRegisteredVoterCountBreakdownError - no counts', () => {
  for (const config of [NONE, BY_PARTY, BY_PARTY_AND_NONPARTISAN]) {
    expect(
      findRegisteredVoterCountBreakdownError(precincts, {}, config)
    ).toBeUndefined();
  }
});

test('findRegisteredVoterCountBreakdownError - breakdowns not allowed', () => {
  expect(
    findRegisteredVoterCountBreakdownError(precincts, totals, NONE)
  ).toBeUndefined();
  expect(
    findRegisteredVoterCountBreakdownError(precincts, byParty, NONE)
  ).toEqual('Registered voter counts must not be broken out by party');
});

test('findRegisteredVoterCountBreakdownError - breakdowns by party', () => {
  expect(
    findRegisteredVoterCountBreakdownError(precincts, byParty, BY_PARTY)
  ).toBeUndefined();
  expect(
    findRegisteredVoterCountBreakdownError(precincts, totals, BY_PARTY)
  ).toEqual('Registered voter counts must be broken out by party');
  expect(
    findRegisteredVoterCountBreakdownError(
      precincts,
      byPartyAndNonpartisan,
      BY_PARTY
    )
  ).toEqual(
    'Registered voter counts by party must not include a nonpartisan count'
  );
});

test('findRegisteredVoterCountBreakdownError - breakdowns by party with a nonpartisan count', () => {
  expect(
    findRegisteredVoterCountBreakdownError(
      precincts,
      byPartyAndNonpartisan,
      BY_PARTY_AND_NONPARTISAN
    )
  ).toBeUndefined();
  expect(
    findRegisteredVoterCountBreakdownError(
      precincts,
      byParty,
      BY_PARTY_AND_NONPARTISAN
    )
  ).toEqual(
    'Registered voter counts by party must include a nonpartisan count'
  );
});
