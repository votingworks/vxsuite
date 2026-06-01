import { buildInsertedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

/** VxScan auth helpers for integration tests (inserted smart-card auth). */
export const {
  logInAsSystemAdministrator,
  logInAsElectionManager,
  logInAsPollWorker,
  forceLogOut,
  forceLogOutAndResetElectionDefinition,
} = buildInsertedSmartCardAuthHelpers({ appName: 'VxScan' });
