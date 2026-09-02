import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

let mockAccessibleControllerConnected = true;

export function setMockAccessibleControllerConnected(connected: boolean): void {
  mockAccessibleControllerConnected = connected;
}

export function getMockAccessibleControllerConnected(): boolean {
  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.USE_MOCK_ACCESSIBLE_CONTROLLER
    )
  ) {
    return mockAccessibleControllerConnected;
  }
  return false;
}
