import { expect, test, vi } from 'vitest';
import { readMultiPartyPrimaryElectionDefinition } from '@votingworks/fixtures';
import { VoterAddressChangeRequest } from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import { LocalStore } from './local_store';
import {
  getTestElectionDefinition,
  setupTestElectionAndVoters,
} from '../test/test_helpers';
import { generateVoterHistoryCsvContent } from './voter_history';

const mockAddressDetails: VoterAddressChangeRequest = {
  streetName: 'MAIN',
  streetNumber: '10',
  state: 'NH',
  streetSuffix: 'I',
  addressLine2: 'line 2',
  apartmentUnitNumber: '1',
  addressLine3: '',
  zipCode: '00000',
  houseFractionNumber: '2',
  city: 'Somewhere',
  precinct: 'precinct-1',
};

test('getNewEvents returns events for unknown machines', () => {
  const store = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  setupTestElectionAndVoters(store, { precinct: 'precinct-1' });
  store.setConfiguredPrecinct('precinct-1');
  // Check in with a default ID method
  store.recordVoterCheckIn({
    voterId: 'abigail',
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });

  store.setIsAbsenteeMode(true);
  // Check in with an OOS DL that is absentee
  store.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
    ballotParty: 'DEM',
  });

  // Record a name change
  store.changeVoterName('charlie', {
    firstName: 'Bella',
    middleName: 'The',
    lastName: 'Beauty',
    suffix: 'II',
  });
  // Record a address change
  store.changeVoterAddress('charlie', {
    ...mockAddressDetails,
  });
  // Create a registration event
  store.registerVoter({
    ...mockAddressDetails,
    party: 'UND',
    firstName: 'Eevee',
    middleName: 'The',
    lastName: 'Enchanting',
    suffix: 'Sr',
  });

  const electionDef = getTestElectionDefinition();
  expect(
    generateVoterHistoryCsvContent(
      store.getAllVotersInPrecinctSorted(),
      electionDef.election
    )
  ).toMatchSnapshot();
});

// Exclusion of "Party Choice" column for general elections is tested in the above test
test('includes ballot party selection for primaries', () => {
  const store = LocalStore.memoryStore(mockBaseLogger({ fn: vi.fn }));
  const primaryElectionDef = readMultiPartyPrimaryElectionDefinition();
  setupTestElectionAndVoters(store, {
    electionDefinition: primaryElectionDef,
    precinct: 'precinct-1',
  });
  store.setConfiguredPrecinct('precinct-1');
  // Check in with a default ID method
  store.recordVoterCheckIn({
    voterId: 'abigail',
    identificationMethod: { type: 'default' },
    ballotParty: 'REP',
  });
  store.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'default' },
    ballotParty: 'DEM',
  });
  // Record a name change so the voter shows up in the voter history without a check-in
  store.changeVoterName('charlie', {
    firstName: 'Bella',
    middleName: 'The',
    lastName: 'Beauty',
    suffix: 'II',
  });

  expect(
    generateVoterHistoryCsvContent(
      store.getAllVotersInPrecinctSorted(),
      primaryElectionDef.election
    )
  ).toMatchSnapshot();
});
