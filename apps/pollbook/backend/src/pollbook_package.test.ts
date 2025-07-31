import { describe, test, expect } from 'vitest';
import { Election } from '@votingworks/types';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { StreetSide } from '@votingworks/types';
import {
  parseVotersFromCsvString,
  parseValidStreetsFromCsvString,
} from './pollbook_package';
import { getTestElection } from '../test/test_helpers';

// Get test election and add precincts with external IDs for testing
const baseElection = getTestElection();
const mockElection: Election = {
  ...baseElection,
  precincts: [
    { id: 'precinct-1', name: 'Precinct 1', districtIds: ['ds-1'] },
    { id: 'precinct-2', name: 'Precinct 2', districtIds: ['ds-1'] },
    { id: 'precinct-3', name: 'Ward 5', districtIds: ['ds-1'] },
    { id: 'precinct-4', name: 'North Side - 10', districtIds: ['ds-1'] },
  ],
};

describe('parseVotersFromCsvString', () => {
  test('parses basic voter CSV data correctly', () => {
    const csvString = `Voter ID,First Name,Last Name,Postal Zip5,Ward
123,John,Doe,12345,1
456,Jane,Smith,67890,2`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        voterId: '123',
        firstName: 'John',
        lastName: 'Doe',
        postalZip5: '12345',
        precinct: 'precinct-1',
      })
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        voterId: '456',
        firstName: 'Jane',
        lastName: 'Smith',
        postalZip5: '67890',
        precinct: 'precinct-2',
      })
    );
  });

  test('throws on invalid election precinct name', () => {
    const csvString = `Voter ID,First Name,Last Name,Postal Zip5,Ward
123,John,Doe,12345,1
456,Jane,Smith,67890,2`;

    suppressingConsoleOutput(() => {
      expect(() =>
        parseVotersFromCsvString(csvString, {
          ...mockElection,
          precincts: [{ id: 'precinct-1', name: '-', districtIds: ['ds-1'] }],
        })
      ).toThrow();
    });
  });

  test('handles camelCase conversion for headers', () => {
    const csvString = `Voter ID,First Name,Last-Name,Postal_Zip5
123,John,Doe,12345`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        voterId: '123',
        firstName: 'John',
        lastName: 'Doe',
        postalZip5: '12345',
      })
    );
  });

  test('pads zip codes with leading zeros', () => {
    const csvString = `Voter ID,Postal Zip5,Zip4,Mailing Zip5,Mailing Zip4
123,123,45,678,90`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        voterId: '123',
        postalZip5: '00123',
        zip4: '0045',
        mailingZip5: '00678',
        mailingZip4: '0090',
      })
    );
  });

  test('pads voter IDs to the same length', () => {
    const csvString = `Voter ID,First Name
1,John
123,Jane
12345,Bob`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result[0].voterId).toEqual('00001');
    expect(result[1].voterId).toEqual('00123');
    expect(result[2].voterId).toEqual('12345');
  });

  test('handles alternative column names', () => {
    const csvString = `Voter ID,Postal City,Mailing Town,Zip5
123,Springfield,Boston,12345`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        voterId: '123',
        postalCityTown: 'Springfield',
        mailingCityTown: 'Boston',
        postalZip5: '12345',
      })
    );
  });

  test('handles preferred column names over alternatives', () => {
    const csvString = `Voter ID,Postal City Town,Postal City,Mailing City Town,Mailing Town
123,Springfield Preferred,Springfield Alt,Boston Preferred,Boston Alt`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        voterId: '123',
        postalCityTown: 'Springfield Preferred',
        mailingCityTown: 'Boston Preferred',
      })
    );
  });

  test('filters out rows without voter ID', () => {
    const csvString = `Voter ID,First Name
123,John
,Jane
456,Bob
,Alice`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result).toHaveLength(2);
    expect(result[0].firstName).toEqual('John');
    expect(result[1].firstName).toEqual('Bob');
  });

  test('skips empty lines', () => {
    const csvString = `Voter ID,First Name
123,John

456,Jane

`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result).toHaveLength(2);
    expect(result[0].firstName).toEqual('John');
    expect(result[1].firstName).toEqual('Jane');
  });

  test('handles ward field mapped to precinct', () => {
    const csvString = `Voter ID,Ward
123,5`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        voterId: '123',
        precinct: 'precinct-3',
      })
    );
  });

  test('handles missing zip code fields gracefully', () => {
    const csvString = `Voter ID,First Name
123,John`;

    const result = parseVotersFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        voterId: '123',
        firstName: 'John',
      })
    );
    expect(result[0].postalZip5).toBeUndefined();
    expect(result[0].zip4).toBeUndefined();
  });
});

describe('parseValidStreetsFromCsvString', () => {
  test('parses basic street CSV data correctly', () => {
    const csvString = `Street Name,Low Range,High Range,Side,Postal City Town
Main St,100,200,odd,Springfield
Oak Ave,1,99,even,Boston`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      streetName: 'Main St',
      lowRange: 100,
      highRange: 200,
      side: 'odd' as StreetSide,
      postalCityTown: 'Springfield',
      precinct: '',
    });
    expect(result[1]).toEqual({
      streetName: 'Oak Ave',
      lowRange: 1,
      highRange: 99,
      side: 'even' as StreetSide,
      postalCityTown: 'Boston',
      precinct: '',
    });
  });

  test('handles camelCase conversion for headers', () => {
    const csvString = `Street Name,Low-Range,High_Range,Postal City/Town,side
Main St,100,200,Springfield,all`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        streetName: 'Main St',
        lowRange: 100,
        highRange: 200,
        postalCityTown: 'Springfield',
        side: 'all' as StreetSide,
      })
    );
  });

  test('converts numeric strings to numbers for ranges', () => {
    const csvString = `Street Name,Low Range,High Range,Side
Main St,100,200,odd`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(typeof result[0].lowRange).toEqual('number');
    expect(typeof result[0].highRange).toEqual('number');
    expect(result[0].lowRange).toEqual(100);
    expect(result[0].highRange).toEqual(200);
  });

  test('converts side to lowercase', () => {
    const csvString = `Street Name,Low Range,High Range,Side
Main St,100,200,ODD
Oak Ave,1,99,EVEN`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result[0].side).toEqual('odd');
    expect(result[1].side).toEqual('even');
  });

  test('handles alternative column names', () => {
    const csvString = `Street Name,Low Range,High Range,Side,Postal City
Main St,100,200,odd,Springfield`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        streetName: 'Main St',
        postalCityTown: 'Springfield',
      })
    );
  });

  test('handles preferred column names over alternatives', () => {
    const csvString = `Street Name,Low Range,High Range,Side,Postal City/Town,Postal City
Main St,100,200,odd,Springfield Preferred,Springfield Alt`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result[0].postalCityTown).toEqual('Springfield Preferred');
  });

  test('maps ward field to precinct', () => {
    const csvString = `Street Name,Low Range,High Range,Side,Ward
Main St,100,200,odd,5`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        streetName: 'Main St',
        lowRange: 100,
        highRange: 200,
        side: 'odd',
        precinct: 'precinct-3',
      })
    );
  });

  test('filters out rows without street name', () => {
    const csvString = `Street Name,Low Range,High Range,Side
Main St,100,200,odd
,1,99,even
Oak Ave,300,400,odd
,500,600,even`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result).toHaveLength(2);
    expect(result[0].streetName).toEqual('Main St');
    expect(result[1].streetName).toEqual('Oak Ave');
  });

  test('skips empty lines', () => {
    const csvString = `Street Name,Low Range,High Range,Side
Main St,100,200,odd

Oak Ave,300,400,even

`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result).toHaveLength(2);
    expect(result[0].streetName).toEqual('Main St');
    expect(result[1].streetName).toEqual('Oak Ave');
  });

  test('handles complete street record with all fields', () => {
    const csvString = `Street Name,Low Range,High Range,Side,Postal City/Town,Ward
Main Street,100,999,both,Springfield,1`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual(
      expect.objectContaining({
        streetName: 'Main Street',
        lowRange: 100,
        highRange: 999,
        side: 'both' as StreetSide,
        postalCityTown: 'Springfield',
        precinct: 'precinct-1',
      })
    );
  });

  test('handles missing optional fields gracefully', () => {
    const csvString = `Street Name,Low Range,High Range,Side
Main St,100,200,odd`;

    const result = parseValidStreetsFromCsvString(csvString, mockElection);

    expect(result[0]).toEqual({
      streetName: 'Main St',
      lowRange: 100,
      highRange: 200,
      side: 'odd' as StreetSide,
      postalCityTown: undefined,
      precinct: '',
    });
  });
});
