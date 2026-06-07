import { buildDippedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

/** VxCentralScan auth helpers for integration tests (dipped smart-card auth). */
export const { logInAsElectionManager, forceLogOutAndResetElectionDefinition } =
  buildDippedSmartCardAuthHelpers({ appName: 'VxCentralScan' });
