import {
  DippedSmartCardAuth as DippedSmartCardAuthTypes,
  InsertedSmartCardAuth as InsertedSmartCardAuthTypes,
} from '@votingworks/types';
import type { Mocked, vi } from 'vitest';

import type { MachineCustomCertFields } from './certs.js';
import { DEV_JURISDICTION } from './jurisdictions.js';
import type { DippedSmartCardAuthApi } from './dipped_smart_card_auth_api.js';
import type {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from './inserted_smart_card_auth_api.js';

/**
 * Builds a mock dipped smart card auth instance for application-level tests
 */
export function buildMockDippedSmartCardAuth(
  fn: typeof vi.fn
): Mocked<DippedSmartCardAuthApi> {
  return {
    getAuthStatus: fn().mockResolvedValue(
      DippedSmartCardAuthTypes.DEFAULT_AUTH_STATUS
    ),
    checkPin: fn(),
    logOut: fn(),
    updateSessionExpiry: fn(),
    programCard: fn(),
    unprogramCard: fn(),
  };
}

/**
 * Builds a mock inserted smart card auth instance for application-level tests
 */
export function buildMockInsertedSmartCardAuth(
  fn: typeof vi.fn
): Mocked<InsertedSmartCardAuthApi> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getAuthStatus: fn((machineState: InsertedSmartCardAuthMachineState) =>
      Promise.resolve(InsertedSmartCardAuthTypes.DEFAULT_AUTH_STATUS)
    ),
    checkPin: fn(),
    logOut: fn(),
    updateSessionExpiry: fn(),
    startCardlessVoterSession: fn(),
    updateCardlessVoterBallotStyle: fn(),
    endCardlessVoterSession: fn(),
    readCardData: fn(),
    writeCardData: fn(),
    clearCardData: fn(),
  };
}

/**
 * Stands in for the signing machine's cert fields that
 * `authenticateArtifactUsingSignatureFile` returns, for tests that mock
 * artifact authentication and do not care who signed what. Pass `overrides` to
 * test code that does care.
 */
export function mockSigningMachineCertFields(
  overrides: Partial<MachineCustomCertFields> = {}
): MachineCustomCertFields {
  return {
    component: 'admin',
    machineId: '0000',
    jurisdiction: DEV_JURISDICTION,
    ...overrides,
  };
}
