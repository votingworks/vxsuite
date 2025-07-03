import { expect, test, describe } from 'vitest';
import { splitStreetNumberDetails } from './address_input_group';

interface TestCase {
  description: string;
  input: string;
  expected: {
    streetNumber: string;
    streetSuffix: string;
    houseFractionNumber: string;
    useHouseFractionSeparator: boolean;
  };
}

describe('splitStreetNumberDetails', () => {
  const testCases: TestCase[] = [
    {
      description: 'parses simple street number',
      input: '16',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },
    {
      description: 'parses street number with fraction',
      input: '16 1/2',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '1/2',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'parses street number with suffix',
      input: '16B',
      expected: {
        streetNumber: '16',
        streetSuffix: 'B',
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },
    {
      description: 'parses street number with suffix after space',
      input: '16 B',
      expected: {
        streetNumber: '16',
        streetSuffix: 'B',
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },
    {
      description: 'parses street number with fraction and suffix',
      input: '16 1/2B',
      expected: {
        streetNumber: '16',
        streetSuffix: 'B',
        houseFractionNumber: '1/2',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'parses street number with trailing space',
      input: '16 ',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'parses street number with fraction without space',
      input: '161/2',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '1/2',
        useHouseFractionSeparator: true,
      },
    },
    {
      description:
        'parses street number with fraction before fraction separator is added',
      input: '16 1',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '1',
        useHouseFractionSeparator: true,
      },
    },
    {
      description:
        'parses street number with fraction before fraction denominator is added',
      input: '16 1/',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '1/',
        useHouseFractionSeparator: true,
      },
    },
    {
      description:
        'parses street number with fraction and suffix without space',
      input: '161/2B',
      expected: {
        streetNumber: '16',
        streetSuffix: 'B',
        houseFractionNumber: '1/2',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'handles non fractional fraction segment with suffix',
      input: '16 1B',
      expected: {
        streetNumber: '16',
        streetSuffix: 'B',
        houseFractionNumber: '1',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'removes illegal characters - prefixed non-digit',
      input: 'A',
      expected: {
        streetNumber: '',
        streetSuffix: '',
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },
    {
      description: 'removes illegal characters - trailing space after suffix',
      input: '16B ',
      expected: {
        streetNumber: '16',
        streetSuffix: 'B', // the trailing space is ignored
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },

    {
      description: 'removes illegal characters - unexpected characters',
      input: '16@',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },
    {
      description: 'handles multi-character suffix',
      input: '16ABC',
      expected: {
        streetNumber: '16',
        streetSuffix: 'ABC',
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },
    {
      description: 'handles different fraction formats',
      input: '16 3/4',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '3/4',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'handles complex example with fraction and suffix',
      input: '123 1/2C',
      expected: {
        streetNumber: '123',
        streetSuffix: 'C',
        houseFractionNumber: '1/2',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'handles invalid input gracefully',
      input: 'ABC',
      expected: {
        streetNumber: '',
        streetSuffix: '',
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },
    {
      description: 'handles empty input',
      input: '',
      expected: {
        streetNumber: '',
        streetSuffix: '',
        houseFractionNumber: '',
        useHouseFractionSeparator: false,
      },
    },

    {
      description: 'handles multi-digit fraction as typed - 1',
      input: '16 10',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '10',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'handles multi-digit fraction as typed - 2',
      input: '16 10/',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '10/',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'handles multi-digit fraction as typed - 3',
      input: '16 10/2',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '10/2',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'handles multi-digit fraction as typed - 4',
      input: '16 10/25',
      expected: {
        streetNumber: '16',
        streetSuffix: '',
        houseFractionNumber: '10/25',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'handles multi-digit fraction as typed - 5',
      input: '16 10/25B',
      expected: {
        streetNumber: '16',
        streetSuffix: 'B',
        houseFractionNumber: '10/25',
        useHouseFractionSeparator: true,
      },
    },
    {
      description: 'handles multi-digit fraction as typed - 6',
      input: '16 10/25BC',
      expected: {
        streetNumber: '16',
        streetSuffix: 'BC',
        houseFractionNumber: '10/25',
        useHouseFractionSeparator: true,
      },
    },
  ];

  for (const { description, input, expected } of testCases) {
    test(`${description} - input: "${input}"`, () => {
      const result = splitStreetNumberDetails(input);
      expect(result).toEqual(expected);
    });
  }
});
