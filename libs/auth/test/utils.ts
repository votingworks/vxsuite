import { MockFunction, mockFunction } from '@votingworks/test-utils';

import { Card } from '../src/card';

/**
 * Generates a numeric array of the specified length, where all values are the specified value
 */
export function numericArray(input: {
  length: number;
  value?: number;
}): number[] {
  return Array.from<number>({ length: input.length }).fill(input.value ?? 0);
}

/**
 * The card API with all methods mocked using our custom libs/test-utils mocks
 */
export interface MockCard {
  getCardStatus: MockFunction<Card['getCardStatus']>;
  checkPin: MockFunction<Card['checkPin']>;
  program: MockFunction<Card['program']>;
  readData: MockFunction<Card['readData']>;
  writeData: MockFunction<Card['writeData']>;
  clearData: MockFunction<Card['clearData']>;
  unprogram: MockFunction<Card['unprogram']>;
}

/**
 * Builds a mock card instance
 */
export function buildMockCard(): MockCard {
  return {
    getCardStatus: mockFunction<Card['getCardStatus']>('getCardStatus'),
    checkPin: mockFunction<Card['checkPin']>('checkPin'),
    program: mockFunction<Card['program']>('program'),
    readData: mockFunction<Card['readData']>('readData'),
    writeData: mockFunction<Card['writeData']>('writeData'),
    clearData: mockFunction<Card['clearData']>('clearData'),
    unprogram: mockFunction<Card['unprogram']>('unprogram'),
  };
}

type MockCardField = keyof MockCard;

/**
 * Asserts that all the expected calls to all the methods of a mock card were made
 */
export function mockCardAssertComplete(mockCard: MockCard): void {
  // Use a Record type to ensure that we're being exhaustive
  const methods: Record<MockCardField, undefined> = {
    getCardStatus: undefined,
    checkPin: undefined,
    program: undefined,
    readData: undefined,
    writeData: undefined,
    clearData: undefined,
    unprogram: undefined,
  };
  for (const method of Object.keys(methods) as MockCardField[]) {
    mockCard[method].assertComplete();
  }
}
