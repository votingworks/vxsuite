import { buildDippedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

/** VxCentralScan auth helpers for integration tests (dipped smart-card auth). */
export const {
  enterPin,
  logInAsSystemAdministrator,
  logInAsElectionManager,
  logOut,
  forceLogOut,
  forceLogOutAndResetElectionDefinition,
} = buildDippedSmartCardAuthHelpers({ appName: 'VxCentralScan' });
