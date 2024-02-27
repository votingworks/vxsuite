import {
  DippedSmartCardAuth as DippedSmartCardAuthTypes,
  InsertedSmartCardAuth as InsertedSmartCardAuthTypes,
} from '@votingworks/types';

import { DippedSmartCardAuthApi } from './dipped_smart_card_auth_api';
import { InsertedSmartCardAuthApi } from './inserted_smart_card_auth_api';

/**
 * Builds a mock dipped smart card auth instance for application-level tests
 */
export function buildMockDippedSmartCardAuth(): jest.Mocked<DippedSmartCardAuthApi> {
  return {
    getAuthStatus: jest
      .fn()
      .mockResolvedValue(DippedSmartCardAuthTypes.DEFAULT_AUTH_STATUS),
    checkPin: jest.fn(),
    logOut: jest.fn(),
    updateSessionExpiry: jest.fn(),
    programCard: jest.fn(),
    unprogramCard: jest.fn(),
  };
}

/**
 * Builds a mock inserted smart card auth instance for application-level tests
 */
export function buildMockInsertedSmartCardAuth(): jest.Mocked<InsertedSmartCardAuthApi> {
  return {
    getAuthStatus: jest
      .fn()
      .mockResolvedValue(InsertedSmartCardAuthTypes.DEFAULT_AUTH_STATUS),
    checkPin: jest.fn(),
    logOut: jest.fn(),
    updateSessionExpiry: jest.fn(),
    startCardlessVoterSession: jest.fn(),
    updateCardlessVoterBallotStyle: jest.fn(),
    endCardlessVoterSession: jest.fn(),
    readCardData: jest.fn(),
    writeCardData: jest.fn(),
    clearCardData: jest.fn(),
  };
}
