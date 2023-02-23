import { Card } from '../src';

/**
 * Builds a mock card instance
 */
export function buildMockCard(): Card {
  return {
    getCardStatus: jest.fn(() => Promise.resolve({ status: 'no_card' })),
    checkPin: jest.fn(),
    writeUser: jest.fn(),
    readData: jest.fn(),
    writeData: jest.fn(),
    clearUserAndData: jest.fn(),
  };
}
