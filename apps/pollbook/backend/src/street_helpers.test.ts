import { describe, test, expect } from 'vitest';
import type {
  ValidStreetInfo,
  VoterRegistrationRequest,
  VoterAddressChangeRequest,
} from '@votingworks/types';
import {
  maybeGetStreetInfoForAddressChange,
  maybeGetStreetInfoForVoterRegistration,
} from './street_helpers';

const mockStreetInfo: ValidStreetInfo[] = [
  {
    streetName: 'MAIN ST',
    side: 'all',
    lowRange: 1,
    highRange: 100,
    postalCityTown: 'MANCHESTER',
    precinct: 'precinct-1',
    zip5: '03101',
    zip4: '0000',
  },
  {
    streetName: 'ELM ST',
    side: 'odd',
    lowRange: 1,
    highRange: 99,
    postalCityTown: 'MANCHESTER',
    precinct: 'precinct-2',
    zip5: '03102',
    zip4: '0000',
  },
  {
    streetName: 'OAK AVE',
    side: 'even',
    lowRange: 2,
    highRange: 50,
    postalCityTown: 'MANCHESTER',
    precinct: 'precinct-1',
    zip5: '03101',
    zip4: '0000',
  },
];

describe('maybeGetStreetInfoForVoterRegistration', () => {
  const validRegistration: VoterRegistrationRequest = {
    firstName: 'John',
    lastName: 'Doe',
    middleName: '',
    suffix: '',
    streetName: 'MAIN ST',
    streetNumber: '50',
    streetSuffix: '',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'MANCHESTER',
    state: 'NH',
    zipCode: '03101',
    party: 'REP',
    precinct: 'precinct-1',
  };

  test('returns street info for valid registration in correct precinct', () => {
    const result = maybeGetStreetInfoForVoterRegistration(
      validRegistration,
      mockStreetInfo
    );
    expect(result).toBeDefined();
    expect(result?.streetName).toEqual('MAIN ST');
    expect(result?.precinct).toEqual('precinct-1');
  });

  test('returns undefined for registration in wrong precinct', () => {
    const registrationInWrongPrecinct: VoterRegistrationRequest = {
      ...validRegistration,
      streetName: 'ELM ST',
      streetNumber: '25',
      city: 'MANCHESTER',
      zipCode: '03102',
      precinct: 'precinct-3', // Different precinct
    };

    const result = maybeGetStreetInfoForVoterRegistration(
      registrationInWrongPrecinct,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });

  test('returns undefined for registration with invalid address', () => {
    const invalidRegistration: VoterRegistrationRequest = {
      ...validRegistration,
      streetName: 'FAKE ST',
      streetNumber: '1',
    };

    const result = maybeGetStreetInfoForVoterRegistration(
      invalidRegistration,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });

  test('returns undefined for registration with invalid zip code', () => {
    const invalidRegistration: VoterRegistrationRequest = {
      ...validRegistration,
      zipCode: '1234', // Invalid zip code (not 5 digits)
    };

    const result = maybeGetStreetInfoForVoterRegistration(
      invalidRegistration,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });

  test('returns undefined for registration with invalid party', () => {
    const invalidRegistration: VoterRegistrationRequest = {
      ...validRegistration,
      party: '', // Empty party (invalid)
    };

    const result = maybeGetStreetInfoForVoterRegistration(
      invalidRegistration,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });

  test('returns undefined for registration with empty required fields', () => {
    const invalidRegistration: VoterRegistrationRequest = {
      ...validRegistration,
      streetNumber: '', // Empty street number
    };

    const result = maybeGetStreetInfoForVoterRegistration(
      invalidRegistration,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });
});

describe('maybeGetStreetInfoForAddressChange', () => {
  const validAddressChange: VoterAddressChangeRequest = {
    streetName: 'MAIN ST',
    streetNumber: '50',
    streetSuffix: '',
    apartmentUnitNumber: '',
    houseFractionNumber: '',
    addressLine2: '',
    addressLine3: '',
    city: 'MANCHESTER',
    state: 'NH',
    zipCode: '03101',
    precinct: 'precinct-1',
  };

  test('returns street info for valid address change in correct precinct', () => {
    const result = maybeGetStreetInfoForAddressChange(
      validAddressChange,
      mockStreetInfo
    );
    expect(result).toBeDefined();
    expect(result?.streetName).toEqual('MAIN ST');
    expect(result?.precinct).toEqual('precinct-1');
  });

  test('returns undefined for address change in wrong precinct', () => {
    const addressChangeInWrongPrecinct: VoterAddressChangeRequest = {
      ...validAddressChange,
      streetName: 'ELM ST',
      streetNumber: '25',
      city: 'MANCHESTER',
      zipCode: '03102',
    };

    const result = maybeGetStreetInfoForAddressChange(
      addressChangeInWrongPrecinct,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });

  test('returns undefined for address change with invalid address', () => {
    const invalidAddressChange: VoterAddressChangeRequest = {
      ...validAddressChange,
      streetName: 'FAKE ST',
      streetNumber: '1',
    };

    const result = maybeGetStreetInfoForAddressChange(
      invalidAddressChange,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });

  test('returns undefined for address change with invalid zip code', () => {
    const invalidAddressChange: VoterAddressChangeRequest = {
      ...validAddressChange,
      zipCode: '1234', // Invalid zip code (not 5 digits)
    };

    const result = maybeGetStreetInfoForAddressChange(
      invalidAddressChange,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });

  test('returns undefined for address change with empty required fields', () => {
    const invalidAddressChange: VoterAddressChangeRequest = {
      ...validAddressChange,
      streetNumber: '', // Empty street number
    };

    const result = maybeGetStreetInfoForAddressChange(
      invalidAddressChange,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });

  test('works with even-side address validation', () => {
    const evenSideAddress: VoterAddressChangeRequest = {
      streetName: 'OAK AVE',
      streetNumber: '20', // Even number
      streetSuffix: '',
      apartmentUnitNumber: '',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'MANCHESTER',
      state: 'NH',
      zipCode: '03101',
      precinct: 'precinct-1',
    };

    const result = maybeGetStreetInfoForAddressChange(
      evenSideAddress,
      mockStreetInfo
    );
    expect(result).toBeDefined();
    expect(result?.streetName).toEqual('OAK AVE');
    expect(result?.side).toEqual('even');
  });

  test('returns undefined for odd number on even-side street', () => {
    const oddSideAddress: VoterAddressChangeRequest = {
      streetName: 'OAK AVE',
      streetNumber: '21', // Odd number on even-side street
      streetSuffix: '',
      apartmentUnitNumber: '',
      houseFractionNumber: '',
      addressLine2: '',
      addressLine3: '',
      city: 'MANCHESTER',
      state: 'NH',
      zipCode: '03101',
      precinct: 'precinct-1',
    };

    const result = maybeGetStreetInfoForAddressChange(
      oddSideAddress,
      mockStreetInfo
    );
    expect(result).toBeUndefined();
  });
});
