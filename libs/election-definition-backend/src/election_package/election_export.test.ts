import { readElectionGeneral } from '@votingworks/fixtures';
import {
  centralScanningPollingPlaceId,
  CENTRAL_SCANNING_POLLING_PLACE_NAME,
  DEFAULT_SYSTEM_SETTINGS,
  earlyVotingPollingPlaceId,
  EARLY_VOTING_POLLING_PLACE_NAME,
  type Election,
  ElectionStringKey,
  type PollingPlace,
  type Precinct,
  type UiStringsPackage,
} from '@votingworks/types';
import { TestLanguageCode } from '@votingworks/test-utils';
import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import {
  addPollingPlacesForExport,
  formatElectionForExport,
} from './election_export.js';

const election = readElectionGeneral();

test('formatElectionForExport', () => {
  const { CHINESE_SIMPLIFIED, ENGLISH, SPANISH } = TestLanguageCode;
  const testTranslations: UiStringsPackage = {
    [CHINESE_SIMPLIFIED]: { [ElectionStringKey.BALLOT_LANGUAGE]: '简体中文' },
    [ENGLISH]: { [ElectionStringKey.BALLOT_LANGUAGE]: 'English' },
    [SPANISH]: { [ElectionStringKey.BALLOT_LANGUAGE]: 'Español' },
  };
  const testPrecincts: Precinct[] = [
    {
      id: 'precinct-1',
      name: 'Precinct One',
      splits: [
        {
          districtIds: ['district_a'],
          id: 'split-1',
          name: 'Split Name',
          electionTitleOverride: 'election title override',
          electionSealOverride: '<svg class="somesvg"></svg>',
          clerkSignatureImage: '<svg class="someothersvg"></svg>',
        },
        {
          districtIds: ['district_b'],
          id: 'split-2',
          name: 'Split Without Overrides',
        },
      ],
    },
  ];
  const formattedElection = formatElectionForExport(
    { ...election, precincts: testPrecincts },
    testTranslations
  );
  expect(formattedElection).toHaveProperty('additionalHashInput');
  const hashInput = assertDefined(formattedElection.additionalHashInput);
  expect(hashInput['precinctSplitSeals']).toMatchObject({
    'precinct-1-split-1': expect.any(String),
  });
  expect(hashInput['precinctSplitSignatureImages']).toMatchObject({
    'precinct-1-split-1': expect.any(String),
  });
  expect(hashInput['precinctSplitSeals']).not.toHaveProperty(
    'precinct-1-split-2'
  );
  expect(hashInput['precinctSplitSignatureImages']).not.toHaveProperty(
    'precinct-1-split-2'
  );
});

test('addPollingPlacesForExport - non-editing state generates election_day places plus a central scanning absentee place', () => {
  const electionInput: Election = {
    ...election,
    pollingPlaces: [],
  };

  const result = addPollingPlacesForExport(
    electionInput,
    { stateCode: 'MS' },
    DEFAULT_SYSTEM_SETTINGS
  );
  const { pollingPlaces } = result;

  // One election_day place per precinct (existing behavior).
  expect(
    pollingPlaces.filter((place) => place.type === 'election_day')
  ).toHaveLength(electionInput.precincts.length);

  // Plus a single absentee place covering every precinct.
  const absenteePlaces = pollingPlaces.filter(
    (place) => place.type === 'absentee'
  );
  expect(absenteePlaces).toEqual([
    {
      id: centralScanningPollingPlaceId(electionInput.id),
      name: CENTRAL_SCANNING_POLLING_PLACE_NAME,
      type: 'absentee',
      precincts: Object.fromEntries(
        electionInput.precincts.map((precinct) => [
          precinct.id,
          { type: 'whole' },
        ])
      ),
    },
  ]);

  // Early voting is not enabled, so no early voting place is generated.
  expect(pollingPlaces.some((place) => place.type === 'early_voting')).toEqual(
    false
  );
});

test('addPollingPlacesForExport - generates an early voting polling place when early voting is enabled', () => {
  const electionInput: Election = {
    ...election,
    pollingPlaces: [],
  };

  const result = addPollingPlacesForExport(
    electionInput,
    { stateCode: 'MS' },
    {
      ...DEFAULT_SYSTEM_SETTINGS,
      enableEarlyVoting: true,
    }
  );
  const { pollingPlaces } = result;

  const earlyVotingPlaces = pollingPlaces.filter(
    (place) => place.type === 'early_voting'
  );
  expect(earlyVotingPlaces).toEqual([
    {
      id: earlyVotingPollingPlaceId(electionInput.id),
      name: EARLY_VOTING_POLLING_PLACE_NAME,
      type: 'early_voting',
      precincts: Object.fromEntries(
        electionInput.precincts.map((precinct) => [
          precinct.id,
          { type: 'whole' },
        ])
      ),
    },
  ]);
});

test('addPollingPlacesForExport - state that allows empty absentee polling places gets no Central Scanning place', () => {
  const electionInput: Election = {
    ...election,
    pollingPlaces: [],
  };

  const result = addPollingPlacesForExport(
    electionInput,
    { stateCode: 'NH' },
    DEFAULT_SYSTEM_SETTINGS
  );
  const pollingPlaces = result.pollingPlaces ?? [];

  expect(pollingPlaces).toHaveLength(electionInput.precincts.length);
  expect(pollingPlaces.every((place) => place.type === 'election_day')).toEqual(
    true
  );
});

test('addPollingPlacesForExport - editing state keeps user-created absentee places untouched', () => {
  const pollingPlaces: PollingPlace[] = [
    {
      id: 'user-absentee',
      name: 'User Absentee Location',
      type: 'absentee',
      precincts: { [election.precincts[0]!.id]: { type: 'whole' } },
    },
  ];
  const electionInput: Election = { ...election, pollingPlaces };

  const result = addPollingPlacesForExport(
    electionInput,
    { stateCode: 'MI' },
    DEFAULT_SYSTEM_SETTINGS
  );

  // Nothing added; the election is returned unchanged.
  expect(result).toEqual(electionInput);
  expect(result.pollingPlaces).toEqual(pollingPlaces);
});

test('addPollingPlacesForExport - editing state does not generate a Central Scanning place when no absentee place exists', () => {
  const pollingPlaces: PollingPlace[] = [
    {
      id: 'election-day-1',
      name: 'Election Day Location',
      type: 'election_day',
      precincts: { [election.precincts[0]!.id]: { type: 'whole' } },
    },
  ];
  const electionInput: Election = { ...election, pollingPlaces };

  const result = addPollingPlacesForExport(
    electionInput,
    { stateCode: 'MI' },
    DEFAULT_SYSTEM_SETTINGS
  );

  // Editing states are validated at finalization instead of having a Central
  // Scanning place auto-generated, so nothing is added here.
  expect(result).toEqual(electionInput);
  expect(result.pollingPlaces).toEqual(pollingPlaces);
});
