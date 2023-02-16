import { DippedSmartCardAuthApi } from './dipped_smart_card_auth';
import { InsertedSmartCardAuthApi } from './inserted_smart_card_auth';

/**
 * Builds a mock dipped smart card auth instance for application-level tests
 */
export function buildMockDippedSmartCardAuth(): DippedSmartCardAuthApi {
  return {
    getAuthStatus: jest.fn(),
    checkPin: jest.fn(),
    logOut: jest.fn(),
    programCard: jest.fn(),
    unprogramCard: jest.fn(),
  };
}

/**
 * Builds a mock inserted smart card auth instance for application-level tests
 */
export function buildMockInsertedSmartCardAuth(): InsertedSmartCardAuthApi {
  return {
    getAuthStatus: jest.fn(),
    checkPin: jest.fn(),
    startCardlessVoterSession: jest.fn(),
    endCardlessVoterSession: jest.fn(),
    readCardData: jest.fn(),
    readCardDataAsString: jest.fn(),
    writeCardData: jest.fn(),
    clearCardData: jest.fn(),
  };
}
