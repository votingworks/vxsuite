import { expect, test } from 'vitest';
import { LocalStore } from './local_store';
import { setupTestElectionAndVoters } from '../test/test_helpers';
import { VoterAddressChangeRequest } from './types';
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
};

test('getNewEvents returns events for unknown machines', () => {
  const store = LocalStore.memoryStore();
  setupTestElectionAndVoters(store);
  // Check in with a default ID method
  store.recordVoterCheckIn({
    voterId: 'abigail',
    identificationMethod: { type: 'default' },
  });

  store.setIsAbsenteeMode(true);
  // Check in with an OOS DL that is absentee
  store.recordVoterCheckIn({
    voterId: 'bob',
    identificationMethod: { type: 'outOfStateLicense', state: 'CA' },
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

  expect(
    generateVoterHistoryCsvContent(store.getAllVotersSorted())
  ).toMatchSnapshot();
});
