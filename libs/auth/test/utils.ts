import { Card } from '../src/card';

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
