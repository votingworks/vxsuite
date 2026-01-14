import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

/* istanbul ignore file - @preserve used only in internal dev and testing */
let mockPatInputConnected = true;

export function setMockPatInputConnected(connected: boolean): void {
  mockPatInputConnected = connected;
}

export function getMockPatInputConnected(): boolean {
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_XKEYS)) {
    return mockPatInputConnected;
  }
  return false;
}
