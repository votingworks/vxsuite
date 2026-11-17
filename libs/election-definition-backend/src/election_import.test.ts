import { expect, test } from 'vitest';
import { assert, assertDefined, find } from '@votingworks/basics';
import {
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import {
  type Candidate,
  type CandidateContest,
  type Election,
  hasSplits,
} from '@votingworks/types';
import {
  prepareElectionForEditing,
  regenerateElectionIds,
  splitCandidateName,
} from './election_import.js';
import { stateFeatureConfigs } from './state_features.js';

const generalElection = readElectionGeneral();
const splitsElection = electionPrimaryPrecinctSplitsFixtures.readElection();

test('regenerateElectionIds gives every entity a new ID and keeps references', () => {
  const firstContest = generalElection.contests[0] as CandidateContest;
  const election: Election = {
    ...generalElection,
    contests: [
      { ...firstContest, partyId: generalElection.parties[0]!.id },
      ...generalElection.contests.slice(1),
    ],
    pollingPlaces: [
      {
        id: 'place-1',
        name: 'Town Hall',
        type: 'absentee',
        precincts: { [generalElection.precincts[0]!.id]: { type: 'whole' } },
      },
    ],
  };
  const { districts, precincts, parties, contests, pollingPlaces } =
    regenerateElectionIds(election, stateFeatureConfigs.DEMO);

  const oldIds = new Set([
    ...election.districts.map((d) => d.id),
    ...election.precincts.map((p) => p.id),
    ...election.parties.map((p) => p.id),
    ...election.contests.map((c) => c.id),
  ]);
  for (const entity of [...districts, ...precincts, ...parties, ...contests]) {
    expect(oldIds.has(entity.id)).toEqual(false);
  }

  const districtIds = new Set(districts.map((d) => d.id));
  const partyIds = new Set(parties.map((p) => p.id));
  for (const contest of contests) {
    expect(districtIds.has(contest.districtId)).toEqual(true);
  }
  const primaryContest = contests[0];
  assert(primaryContest?.type === 'candidate');
  expect(partyIds.has(assertDefined(primaryContest.partyId))).toEqual(true);
  for (const candidate of primaryContest.candidates) {
    for (const partyId of candidate.partyIds ?? []) {
      expect(partyIds.has(partyId)).toEqual(true);
    }
  }
  const oldOptionIds = new Set(
    election.contests.flatMap((c) =>
      c.type === 'yesno' ? c.options.map((o) => o.id) : []
    )
  );
  const newOptionIds = contests.flatMap((c) =>
    c.type === 'yesno' ? c.options.map((o) => o.id) : []
  );
  expect(newOptionIds).not.toHaveLength(0);
  for (const optionId of newOptionIds) {
    expect(oldOptionIds.has(optionId)).toEqual(false);
  }

  expect(pollingPlaces).toEqual([
    {
      id: expect.any(String),
      name: 'Town Hall',
      type: 'absentee',
      precincts: { [precincts[0]!.id]: { type: 'whole' } },
    },
  ]);
  expect(pollingPlaces[0]!.id).not.toEqual('place-1');
});

test('regenerateElectionIds keeps precinct splits pointing at the new districts', () => {
  const { districts, precincts } = regenerateElectionIds(
    splitsElection,
    stateFeatureConfigs.DEMO
  );
  const districtIds = new Set(districts.map((d) => d.id));
  const splitPrecinct = find(precincts, hasSplits);
  for (const split of splitPrecinct.splits) {
    for (const districtId of split.districtIds) {
      expect(districtIds.has(districtId)).toEqual(true);
    }
  }
});

test('regenerateElectionIds generates election day polling places when there are none', () => {
  const { precincts, pollingPlaces } = regenerateElectionIds(
    { ...generalElection, pollingPlaces: [] },
    stateFeatureConfigs.DEMO
  );
  expect(pollingPlaces).toHaveLength(precincts.length);
  expect(pollingPlaces.every((place) => place.type === 'election_day')).toEqual(
    true
  );
});

test('regenerateElectionIds leaves polling places to export when the state does not edit them', () => {
  expect(
    regenerateElectionIds(generalElection, stateFeatureConfigs.MS).pollingPlaces
  ).toEqual([]);
});

test('splitCandidateName', () => {
  expect(splitCandidateName('Ada Byron King Lovelace')).toEqual({
    firstName: 'Ada',
    middleName: 'Byron King',
    lastName: 'Lovelace',
  });
  expect(splitCandidateName('Madonna')).toEqual({
    firstName: 'Madonna',
    middleName: '',
    lastName: '',
  });
});

test('prepareElectionForEditing', () => {
  const firstContest = generalElection.contests[0] as CandidateContest;
  const splitCandidate: Candidate = {
    id: 'split-candidate',
    name: 'Grace Hopper',
    firstName: 'Grace',
    middleName: 'Brewster',
    lastName: 'Hopper',
  };
  const election: Election = {
    ...generalElection,
    seal: undefined as unknown as string,
    contests: [
      {
        ...firstContest,
        candidates: [
          splitCandidate,
          { id: 'unsplit-candidate', name: 'Alan Mathison Turing' },
        ],
      },
      ...generalElection.contests.slice(1),
    ],
  };

  const prepared = prepareElectionForEditing({
    election,
    newId: 'new-election',
    stateFeatures: stateFeatureConfigs.DEMO,
  });
  expect(prepared.id).toEqual('new-election');
  expect(prepared.jurisdiction).toEqual({
    ...generalElection.jurisdiction,
    id: 'new-election-county',
  });
  expect(prepared.ballotStyles).toEqual([]);
  expect(prepared.seal).toEqual('');
  expect(prepared.contests).toHaveLength(generalElection.contests.length);

  const preparedContest = prepared.contests[0];
  assert(preparedContest?.type === 'candidate');
  expect(preparedContest.candidates).toEqual([
    { ...splitCandidate, id: expect.any(String) },
    {
      id: expect.any(String),
      name: 'Alan Mathison Turing',
      firstName: 'Alan',
      middleName: 'Mathison',
      lastName: 'Turing',
    },
  ]);

  expect(
    prepareElectionForEditing({
      election: generalElection,
      newId: 'another-election',
      stateFeatures: stateFeatureConfigs.DEMO,
    }).seal
  ).toEqual(generalElection.seal);
});
