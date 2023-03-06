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
 * Builds a mock card instance
 */
export function buildMockCard(): Card {
  return {
    getCardStatus: jest.fn(() => Promise.resolve({ status: 'no_card' })),
    checkPin: jest.fn(),
    program: jest.fn(),
    readData: jest.fn(),
    writeData: jest.fn(),
    clearData: jest.fn(),
    unprogram: jest.fn(),
  };
}
