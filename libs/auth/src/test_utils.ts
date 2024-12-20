import {
  DippedSmartCardAuth as DippedSmartCardAuthTypes,
  InsertedSmartCardAuth as InsertedSmartCardAuthTypes,
} from '@votingworks/types';
import type { Mocked, vi } from 'vitest';

import { DippedSmartCardAuthApi } from './dipped_smart_card_auth_api';
import { InsertedSmartCardAuthApi } from './inserted_smart_card_auth_api';

type jfn = typeof jest.fn;
type vfn = typeof vi.fn;

/**
 * Builds a mock dipped smart card auth instance for application-level tests
 */
export function buildMockDippedSmartCardAuth(): jest.Mocked<DippedSmartCardAuthApi>;
/**
 * Builds a mock dipped smart card auth instance for application-level tests
 */

export function buildMockDippedSmartCardAuth(
  fn: jfn
): jest.Mocked<DippedSmartCardAuthApi>;

/**
 * Builds a mock dipped smart card auth instance for application-level tests
 */
export function buildMockDippedSmartCardAuth(
  fn: vfn
): Mocked<DippedSmartCardAuthApi>;

/**
 * Builds a mock dipped smart card auth instance for application-level tests
 */
export function buildMockDippedSmartCardAuth(
  fn: jfn | vfn = jest.fn
): jest.Mocked<DippedSmartCardAuthApi> | Mocked<DippedSmartCardAuthApi> {
  return {
    getAuthStatus: (fn as jfn)().mockResolvedValue(
      DippedSmartCardAuthTypes.DEFAULT_AUTH_STATUS
    ),
    checkPin: (fn as jfn)(),
    logOut: (fn as jfn)(),
    updateSessionExpiry: (fn as jfn)(),
    programCard: (fn as jfn)(),
    unprogramCard: (fn as jfn)(),
  };
}

/**
 * Builds a mock inserted smart card auth instance for application-level tests
 */
export function buildMockInsertedSmartCardAuth(): jest.Mocked<InsertedSmartCardAuthApi>;

/**
 * Builds a mock inserted smart card auth instance for application-level tests
 */
export function buildMockInsertedSmartCardAuth(
  fn: jfn
): jest.Mocked<InsertedSmartCardAuthApi>;

/**
 * Builds a mock inserted smart card auth instance for application-level tests
 */
export function buildMockInsertedSmartCardAuth(
  fn: vfn
): Mocked<InsertedSmartCardAuthApi>;

/**
 * Builds a mock inserted smart card auth instance for application-level tests
 */
export function buildMockInsertedSmartCardAuth(
  fn: jfn | vfn = jest.fn
): jest.Mocked<InsertedSmartCardAuthApi> | Mocked<InsertedSmartCardAuthApi> {
  return {
    getAuthStatus: (fn as jfn)().mockResolvedValue(
      InsertedSmartCardAuthTypes.DEFAULT_AUTH_STATUS
    ),
    checkPin: (fn as jfn)(),
    logOut: (fn as jfn)(),
    updateSessionExpiry: (fn as jfn)(),
    startCardlessVoterSession: (fn as jfn)(),
    updateCardlessVoterBallotStyle: (fn as jfn)(),
    endCardlessVoterSession: (fn as jfn)(),
    readCardData: (fn as jfn)(),
    writeCardData: (fn as jfn)(),
    clearCardData: (fn as jfn)(),
  };
}
