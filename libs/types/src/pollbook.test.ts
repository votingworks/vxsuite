import { describe, expect, test } from 'vitest';
import {
  VoterSchema,
  VoterAddressChangeSchema,
  VoterMailingAddressChangeSchema,
  VoterNameChangeSchema,
  VoterRegistrationSchema,
  ValidStreetInfoSchema,
  VOTER_INPUT_FIELD_LIMITS,
  truncateToMaxLength,
  SummaryStatistics,
  getImportedVotersCount,
  getImportedVotersCountRaw,
  getUndeclaredPrimaryPartyChoice,
  PrimarySummaryStatistics,
  getUndeclaredPrimaryPartyChoiceRaw,
  getTotalPrecinctCheckInsRaw,
  getTotalPrecinctCheckIns,
} from './pollbook';

describe('Zod schema string truncation', () => {
  test('VoterSchema truncates strings to field limits', () => {
    const longStrings = {
      lastName: 'a'.repeat(VOTER_INPUT_FIELD_LIMITS.lastName + 1),
      suffix: 'b'.repeat(VOTER_INPUT_FIELD_LIMITS.nameSuffix + 1),
      firstName: 'c'.repeat(VOTER_INPUT_FIELD_LIMITS.firstName + 1),
      middleName: 'd'.repeat(VOTER_INPUT_FIELD_LIMITS.middleName + 1),
      streetNumber: 'e'.repeat(VOTER_INPUT_FIELD_LIMITS.streetNumber + 1),
      addressSuffix: 'f'.repeat(VOTER_INPUT_FIELD_LIMITS.streetSuffix + 1),
      streetName: 'g'.repeat(VOTER_INPUT_FIELD_LIMITS.streetName + 1),
      apartmentUnitNumber: 'h'.repeat(
        VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber + 1
      ),
      addressLine2: 'i'.repeat(VOTER_INPUT_FIELD_LIMITS.addressLine2 + 1),
      postalZip5: 'j'.repeat(VOTER_INPUT_FIELD_LIMITS.zip5 + 1),
      zip4: 'k'.repeat(VOTER_INPUT_FIELD_LIMITS.zip4 + 1),
      mailingStreetNumber: 'l'.repeat(
        VOTER_INPUT_FIELD_LIMITS.streetNumber + 1
      ),
      mailingSuffix: 'm'.repeat(VOTER_INPUT_FIELD_LIMITS.streetSuffix + 1),
      mailingStreetName: 'n'.repeat(VOTER_INPUT_FIELD_LIMITS.streetName + 1),
      mailingApartmentUnitNumber: 'o'.repeat(
        VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber + 1
      ),
      mailingAddressLine2: 'p'.repeat(
        VOTER_INPUT_FIELD_LIMITS.addressLine2 + 1
      ),
      mailingCityTown: 'q'.repeat(VOTER_INPUT_FIELD_LIMITS.cityTown + 1),
      mailingZip5: 'r'.repeat(VOTER_INPUT_FIELD_LIMITS.zip5 + 1),
      mailingZip4: 's'.repeat(VOTER_INPUT_FIELD_LIMITS.zip4 + 1),
    } as const;

    const voter = VoterSchema.parse({
      voterId: 'test-voter-id',
      ...longStrings,
      houseFractionNumber: 'test',
      addressLine3: 'test',
      postalCityTown: 'test',
      state: 'test',
      mailingHouseFractionNumber: 'test',
      mailingAddressLine3: 'test',
      mailingState: 'test',
      party: 'DEM',
      precinct: 'test',
      isInactive: false,
    });

    expect(voter.lastName).toEqual(
      'a'.repeat(VOTER_INPUT_FIELD_LIMITS.lastName)
    );
    expect(voter.suffix).toEqual(
      'b'.repeat(VOTER_INPUT_FIELD_LIMITS.nameSuffix)
    );
    expect(voter.firstName).toEqual(
      'c'.repeat(VOTER_INPUT_FIELD_LIMITS.firstName)
    );
    expect(voter.middleName).toEqual(
      'd'.repeat(VOTER_INPUT_FIELD_LIMITS.middleName)
    );
    expect(voter.streetNumber).toEqual(
      'e'.repeat(VOTER_INPUT_FIELD_LIMITS.streetNumber)
    );
    expect(voter.addressSuffix).toEqual(
      'f'.repeat(VOTER_INPUT_FIELD_LIMITS.streetSuffix)
    );
    expect(voter.streetName).toEqual(
      'g'.repeat(VOTER_INPUT_FIELD_LIMITS.streetName)
    );
    expect(voter.apartmentUnitNumber).toEqual(
      'h'.repeat(VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    );
    expect(voter.addressLine2).toEqual(
      'i'.repeat(VOTER_INPUT_FIELD_LIMITS.addressLine2)
    );
    expect(voter.postalZip5).toEqual('j'.repeat(VOTER_INPUT_FIELD_LIMITS.zip5));
    expect(voter.zip4).toEqual('k'.repeat(VOTER_INPUT_FIELD_LIMITS.zip4));
    expect(voter.mailingStreetNumber).toEqual(
      'l'.repeat(VOTER_INPUT_FIELD_LIMITS.streetNumber)
    );
    expect(voter.mailingSuffix).toEqual(
      'm'.repeat(VOTER_INPUT_FIELD_LIMITS.streetSuffix)
    );
    expect(voter.mailingStreetName).toEqual(
      'n'.repeat(VOTER_INPUT_FIELD_LIMITS.streetName)
    );
    expect(voter.mailingApartmentUnitNumber).toEqual(
      'o'.repeat(VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    );
    expect(voter.mailingAddressLine2).toEqual(
      'p'.repeat(VOTER_INPUT_FIELD_LIMITS.addressLine2)
    );
    expect(voter.mailingCityTown).toEqual(
      'q'.repeat(VOTER_INPUT_FIELD_LIMITS.cityTown)
    );
    expect(voter.mailingZip5).toEqual(
      'r'.repeat(VOTER_INPUT_FIELD_LIMITS.zip5)
    );
    expect(voter.mailingZip4).toEqual(
      's'.repeat(VOTER_INPUT_FIELD_LIMITS.zip4)
    );
  });

  test('VoterAddressChangeSchema truncates strings to field limits', () => {
    const longStrings = {
      streetNumber: 'a'.repeat(VOTER_INPUT_FIELD_LIMITS.streetNumber + 1),
      streetSuffix: 'b'.repeat(VOTER_INPUT_FIELD_LIMITS.streetSuffix + 1),
      apartmentUnitNumber: 'c'.repeat(
        VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber + 1
      ),
      addressLine2: 'd'.repeat(VOTER_INPUT_FIELD_LIMITS.addressLine2 + 1),
    } as const;

    const addressChange = VoterAddressChangeSchema.parse({
      ...longStrings,
      houseFractionNumber: 'test',
      streetName: 'test',
      addressLine3: 'test',
      city: 'test',
      state: 'test',
      zipCode: 'test',
      timestamp: 'test',
      precinct: 'test',
    });

    expect(addressChange.streetNumber).toEqual(
      'a'.repeat(VOTER_INPUT_FIELD_LIMITS.streetNumber)
    );
    expect(addressChange.streetSuffix).toEqual(
      'b'.repeat(VOTER_INPUT_FIELD_LIMITS.streetSuffix)
    );
    expect(addressChange.apartmentUnitNumber).toEqual(
      'c'.repeat(VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    );
    expect(addressChange.addressLine2).toEqual(
      'd'.repeat(VOTER_INPUT_FIELD_LIMITS.addressLine2)
    );
  });

  test('VoterMailingAddressChangeSchema truncates strings to field limits', () => {
    const longStrings = {
      mailingStreetNumber: 'a'.repeat(
        VOTER_INPUT_FIELD_LIMITS.streetNumber + 1
      ),
      mailingStreetName: 'b'.repeat(VOTER_INPUT_FIELD_LIMITS.streetName + 1),
      mailingSuffix: 'c'.repeat(VOTER_INPUT_FIELD_LIMITS.nameSuffix + 1),
      mailingApartmentUnitNumber: 'd'.repeat(
        VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber + 1
      ),
      mailingAddressLine2: 'e'.repeat(
        VOTER_INPUT_FIELD_LIMITS.addressLine2 + 1
      ),
      mailingCityTown: 'f'.repeat(VOTER_INPUT_FIELD_LIMITS.cityTown + 1),
      mailingZip5: 'g'.repeat(VOTER_INPUT_FIELD_LIMITS.zip5 + 1),
      mailingZip4: 'h'.repeat(VOTER_INPUT_FIELD_LIMITS.zip4 + 1),
    } as const;

    const mailingAddressChange = VoterMailingAddressChangeSchema.parse({
      ...longStrings,
      mailingHouseFractionNumber: 'test',
      mailingAddressLine3: 'test',
      mailingState: 'test',
      timestamp: 'test',
    });

    expect(mailingAddressChange.mailingStreetNumber).toEqual(
      'a'.repeat(VOTER_INPUT_FIELD_LIMITS.streetNumber)
    );
    expect(mailingAddressChange.mailingStreetName).toEqual(
      'b'.repeat(VOTER_INPUT_FIELD_LIMITS.streetName)
    );
    expect(mailingAddressChange.mailingSuffix).toEqual(
      'c'.repeat(VOTER_INPUT_FIELD_LIMITS.nameSuffix)
    );
    expect(mailingAddressChange.mailingApartmentUnitNumber).toEqual(
      'd'.repeat(VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    );
    expect(mailingAddressChange.mailingAddressLine2).toEqual(
      'e'.repeat(VOTER_INPUT_FIELD_LIMITS.addressLine2)
    );
    expect(mailingAddressChange.mailingCityTown).toEqual(
      'f'.repeat(VOTER_INPUT_FIELD_LIMITS.cityTown)
    );
    expect(mailingAddressChange.mailingZip5).toEqual(
      'g'.repeat(VOTER_INPUT_FIELD_LIMITS.zip5)
    );
    expect(mailingAddressChange.mailingZip4).toEqual(
      'h'.repeat(VOTER_INPUT_FIELD_LIMITS.zip4)
    );
  });

  test('VoterNameChangeSchema truncates strings to field limits', () => {
    const longStrings = {
      lastName: 'a'.repeat(VOTER_INPUT_FIELD_LIMITS.lastName + 1),
      suffix: 'b'.repeat(VOTER_INPUT_FIELD_LIMITS.nameSuffix + 1),
      firstName: 'c'.repeat(VOTER_INPUT_FIELD_LIMITS.firstName + 1),
      middleName: 'd'.repeat(VOTER_INPUT_FIELD_LIMITS.middleName + 1),
    } as const;

    const nameChange = VoterNameChangeSchema.parse({
      ...longStrings,
      timestamp: 'test',
    });

    expect(nameChange.lastName).toEqual(
      'a'.repeat(VOTER_INPUT_FIELD_LIMITS.lastName)
    );
    expect(nameChange.suffix).toEqual(
      'b'.repeat(VOTER_INPUT_FIELD_LIMITS.nameSuffix)
    );
    expect(nameChange.firstName).toEqual(
      'c'.repeat(VOTER_INPUT_FIELD_LIMITS.firstName)
    );
    expect(nameChange.middleName).toEqual(
      'd'.repeat(VOTER_INPUT_FIELD_LIMITS.middleName)
    );
  });

  test('VoterRegistrationSchema truncates strings to field limits', () => {
    const longStrings = {
      // Name fields
      lastName: 'a'.repeat(VOTER_INPUT_FIELD_LIMITS.lastName + 1),
      suffix: 'b'.repeat(VOTER_INPUT_FIELD_LIMITS.nameSuffix + 1),
      firstName: 'c'.repeat(VOTER_INPUT_FIELD_LIMITS.firstName + 1),
      middleName: 'd'.repeat(VOTER_INPUT_FIELD_LIMITS.middleName + 1),
      // Address fields
      streetNumber: 'e'.repeat(VOTER_INPUT_FIELD_LIMITS.streetNumber + 1),
      streetSuffix: 'f'.repeat(VOTER_INPUT_FIELD_LIMITS.streetSuffix + 1),
      apartmentUnitNumber: 'g'.repeat(
        VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber + 1
      ),
      addressLine2: 'h'.repeat(VOTER_INPUT_FIELD_LIMITS.addressLine2 + 1),
    } as const;

    const registration = VoterRegistrationSchema.parse({
      ...longStrings,
      houseFractionNumber: 'test',
      streetName: 'test',
      addressLine3: 'test',
      city: 'test',
      state: 'test',
      zipCode: 'test',
      party: 'DEM',
      timestamp: 'test',
      voterId: 'test',
      precinct: 'test',
    });

    expect(registration.lastName).toEqual(
      'a'.repeat(VOTER_INPUT_FIELD_LIMITS.lastName)
    );
    expect(registration.suffix).toEqual(
      'b'.repeat(VOTER_INPUT_FIELD_LIMITS.nameSuffix)
    );
    expect(registration.firstName).toEqual(
      'c'.repeat(VOTER_INPUT_FIELD_LIMITS.firstName)
    );
    expect(registration.middleName).toEqual(
      'd'.repeat(VOTER_INPUT_FIELD_LIMITS.middleName)
    );
    expect(registration.streetNumber).toEqual(
      'e'.repeat(VOTER_INPUT_FIELD_LIMITS.streetNumber)
    );
    expect(registration.streetSuffix).toEqual(
      'f'.repeat(VOTER_INPUT_FIELD_LIMITS.streetSuffix)
    );
    expect(registration.apartmentUnitNumber).toEqual(
      'g'.repeat(VOTER_INPUT_FIELD_LIMITS.apartmentUnitNumber)
    );
    expect(registration.addressLine2).toEqual(
      'h'.repeat(VOTER_INPUT_FIELD_LIMITS.addressLine2)
    );
  });

  test('ValidStreetInfoSchema truncates strings to field limits', () => {
    const longStrings = {
      streetName: 'a'.repeat(VOTER_INPUT_FIELD_LIMITS.streetName + 1),
      postalCityTown: 'b'.repeat(VOTER_INPUT_FIELD_LIMITS.cityTown + 1),
      zip5: 'c'.repeat(VOTER_INPUT_FIELD_LIMITS.zip5 + 1),
      zip4: 'd'.repeat(VOTER_INPUT_FIELD_LIMITS.zip4 + 1),
    } as const;

    const validStreets = ValidStreetInfoSchema.parse([
      {
        ...longStrings,
        side: 'all',
        lowRange: 1,
        highRange: 10,
        precinct: 'test',
      },
    ]);

    expect(validStreets[0].streetName).toEqual(
      'a'.repeat(VOTER_INPUT_FIELD_LIMITS.streetName)
    );
    expect(validStreets[0].postalCityTown).toEqual(
      'b'.repeat(VOTER_INPUT_FIELD_LIMITS.cityTown)
    );
    expect(validStreets[0].zip5).toEqual(
      'c'.repeat(VOTER_INPUT_FIELD_LIMITS.zip5)
    );
    expect(validStreets[0].zip4).toEqual(
      'd'.repeat(VOTER_INPUT_FIELD_LIMITS.zip4)
    );
  });

  test('schemas preserve strings shorter than limits', () => {
    const shortName = 'John';

    const voter = VoterSchema.parse({
      voterId: 'test',
      lastName: shortName,
      suffix: '',
      firstName: shortName,
      middleName: '',
      streetNumber: '123',
      addressSuffix: '',
      houseFractionNumber: '',
      streetName: 'Main St',
      apartmentUnitNumber: '',
      addressLine2: '',
      addressLine3: '',
      postalCityTown: 'City',
      state: 'ST',
      postalZip5: '12345',
      zip4: '6789',
      mailingStreetNumber: '456',
      mailingSuffix: '',
      mailingHouseFractionNumber: '',
      mailingStreetName: 'Oak Ave',
      mailingApartmentUnitNumber: '',
      mailingAddressLine2: '',
      mailingAddressLine3: '',
      mailingCityTown: 'Town',
      mailingState: 'ST',
      mailingZip5: '54321',
      mailingZip4: '9876',
      party: 'DEM',
      precinct: 'P1',
      isInactive: false,
    });

    expect(voter.firstName).toEqual(shortName);
    expect(voter.lastName).toEqual(shortName);
    expect(voter.streetName).toEqual('Main St');
    expect(voter.mailingStreetName).toEqual('Oak Ave');
  });
});

describe('truncateToMaxLength', () => {
  test('returns the original string if its length is less than maxLength', () => {
    expect(truncateToMaxLength('abc', 5)).toEqual('abc');
  });

  test('returns the original string if its length is equal to maxLength', () => {
    expect(truncateToMaxLength('abcde', 5)).toEqual('abcde');
  });

  test('returns the truncated string if its length is greater than maxLength', () => {
    expect(truncateToMaxLength('abcdef', 5)).toEqual('abcde');
  });

  test('returns empty string if input is empty', () => {
    expect(truncateToMaxLength('', 5)).toEqual('');
  });

  test('returns empty string if maxLength is 0', () => {
    expect(truncateToMaxLength('abc', 0)).toEqual('');
  });
});

describe('Statistics helper functions', () => {
  const baseSummaryStats: SummaryStatistics = {
    totalVoters: 1000,
    totalCheckIns: 500,
    totalNewRegistrations: 50,
    totalAbsenteeCheckIns: 100,
  };

  const primaryStats: PrimarySummaryStatistics = {
    ...baseSummaryStats,
    totalUndeclaredDemCheckIns: 25,
    totalUndeclaredRepCheckIns: 30,
  };

  describe('getUndeclaredPrimaryPartyChoiceRaw', () => {
    test('returns totalUndeclaredDemCheckIns for DEM', () => {
      expect(getUndeclaredPrimaryPartyChoiceRaw('DEM', primaryStats)).toEqual(
        25
      );
    });

    test('returns totalUndeclaredRepCheckIns for REP', () => {
      expect(getUndeclaredPrimaryPartyChoiceRaw('REP', primaryStats)).toEqual(
        30
      );
    });

    test('returns 0 when counts are 0', () => {
      const zeroStats: PrimarySummaryStatistics = {
        ...baseSummaryStats,
        totalUndeclaredDemCheckIns: 0,
        totalUndeclaredRepCheckIns: 0,
      };
      expect(getUndeclaredPrimaryPartyChoiceRaw('DEM', zeroStats)).toEqual(0);
      expect(getUndeclaredPrimaryPartyChoiceRaw('REP', zeroStats)).toEqual(0);
    });
  });

  describe('getUndeclaredPrimaryPartyChoice', () => {
    test('returns formatted string for DEM', () => {
      expect(getUndeclaredPrimaryPartyChoice('DEM', primaryStats)).toEqual(
        '25'
      );
    });

    test('returns formatted string for REP', () => {
      expect(getUndeclaredPrimaryPartyChoice('REP', primaryStats)).toEqual(
        '30'
      );
    });

    test('formats large numbers with commas', () => {
      const largeStats: PrimarySummaryStatistics = {
        ...baseSummaryStats,
        totalUndeclaredDemCheckIns: 1234567,
        totalUndeclaredRepCheckIns: 9876543,
      };
      expect(getUndeclaredPrimaryPartyChoice('DEM', largeStats)).toEqual(
        '1,234,567'
      );
      expect(getUndeclaredPrimaryPartyChoice('REP', largeStats)).toEqual(
        '9,876,543'
      );
    });
  });

  describe('getImportedVotersCountRaw', () => {
    test('returns totalVoters minus totalNewRegistrations', () => {
      expect(getImportedVotersCountRaw(baseSummaryStats)).toEqual(950);
    });

    test('returns 0 when all voters are new registrations', () => {
      const allNewStats: SummaryStatistics = {
        ...baseSummaryStats,
        totalVoters: 100,
        totalNewRegistrations: 100,
      };
      expect(getImportedVotersCountRaw(allNewStats)).toEqual(0);
    });

    test('works with primary stats', () => {
      expect(getImportedVotersCountRaw(primaryStats)).toEqual(950);
    });
  });

  describe('getImportedVotersCount', () => {
    test('returns formatted string', () => {
      expect(getImportedVotersCount(baseSummaryStats)).toEqual('950');
    });

    test('formats large numbers with commas', () => {
      const largeStats: SummaryStatistics = {
        totalVoters: 1000000,
        totalCheckIns: 500000,
        totalNewRegistrations: 1000,
        totalAbsenteeCheckIns: 50000,
      };
      expect(getImportedVotersCount(largeStats)).toEqual('999,000');
    });
  });

  describe('getTotalPrecinctCheckIns', () => {
    test('returns totalCheckIns minus totalAbsenteeCheckIns', () => {
      expect(getTotalPrecinctCheckInsRaw(baseSummaryStats)).toEqual(400);
    });

    test('returns 0 when all check-ins are absentee', () => {
      const allAbsenteeStats: SummaryStatistics = {
        ...baseSummaryStats,
        totalCheckIns: 100,
        totalAbsenteeCheckIns: 100,
      };
      expect(getTotalPrecinctCheckInsRaw(allAbsenteeStats)).toEqual(0);
    });

    test('returns formatted string', () => {
      expect(getTotalPrecinctCheckIns(baseSummaryStats)).toEqual('400');
    });

    test('formats large numbers with commas', () => {
      const largeStats: SummaryStatistics = {
        totalVoters: 1000000,
        totalCheckIns: 500000,
        totalNewRegistrations: 1000,
        totalAbsenteeCheckIns: 50000,
      };
      expect(getTotalPrecinctCheckIns(largeStats)).toEqual('450,000');
    });

    test('works with primary stats', () => {
      expect(getTotalPrecinctCheckInsRaw(primaryStats)).toEqual(400);
      expect(getTotalPrecinctCheckIns(primaryStats)).toEqual('400');
    });
  });
});
