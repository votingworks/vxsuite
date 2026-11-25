import { expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import type { Contest, PollingPlace } from '@votingworks/types';
import { getFinalizeBlocker } from './finalize_blocker.js';

const election = readElectionGeneral();

const absenteePollingPlace: PollingPlace = {
  id: 'absentee',
  name: 'Absentee',
  type: 'absentee',
  precincts: Object.fromEntries(
    election.precincts.map((precinct) => [precinct.id, { type: 'whole' }])
  ),
};

const straightPartyContest = {
  id: 'straight-party',
  type: 'straight-party',
} as unknown as Contest;

type FinalizeBlockerInput = Parameters<typeof getFinalizeBlocker>[0];

const finalizableInput: FinalizeBlockerInput = {
  appName: 'VxTest',
  features: {},
  electionType: 'general',
  ballotStyles: election.ballotStyles,
  contests: election.contests,
  precincts: election.precincts,
  registeredVoterCounts: {},
  pollingPlaces: [],
};

test('no blocker for a finalizable election', () => {
  expect(getFinalizeBlocker(finalizableInput)).toEqual(undefined);
});

test('blocks an election without ballot styles', () => {
  expect(getFinalizeBlocker({ ...finalizableInput, ballotStyles: [] })).toEqual(
    {
      title: 'Ballots Incomplete',
      message:
        'VxTest will create ballot styles for your election once you have created districts, precincts, and contests.',
    }
  );
});

test('blocks a general election that needs a straight party contest without one', () => {
  const input: FinalizeBlockerInput = {
    ...finalizableInput,
    features: { STRAIGHT_PARTY_VOTING: true },
  };
  expect(getFinalizeBlocker(input)?.title).toEqual(
    'Cannot generate straight party contest'
  );
  expect(
    getFinalizeBlocker({
      ...input,
      contests: [...election.contests, straightPartyContest],
    })
  ).toEqual(undefined);
  expect(getFinalizeBlocker({ ...input, electionType: 'primary' })).toEqual(
    undefined
  );
});

test('blocks partial registered voter counts', () => {
  const [precinct] = election.precincts;
  expect(
    getFinalizeBlocker({
      ...finalizableInput,
      registeredVoterCounts: { [precinct!.id]: { total: 100 } },
    })?.title
  ).toEqual(
    'Registered voter counts must be provided for all precincts and splits, or none.'
  );
});

test('blocks precincts without an absentee polling place when polling places are edited', () => {
  const input: FinalizeBlockerInput = {
    ...finalizableInput,
    features: { EDIT_POLLING_PLACES: true },
  };
  expect(getFinalizeBlocker(input)?.title).toEqual(
    'Absentee polling places must cover every precinct.'
  );
  expect(
    getFinalizeBlocker({ ...input, pollingPlaces: [absenteePollingPlace] })
  ).toEqual(undefined);
  expect(
    getFinalizeBlocker({
      ...input,
      features: { ...input.features, OMIT_ABSENTEE_POLLING_PLACES: true },
    })
  ).toEqual(undefined);
});
