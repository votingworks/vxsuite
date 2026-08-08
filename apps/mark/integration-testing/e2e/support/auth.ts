import { buildInsertedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

/** VxMark auth helpers for integration tests (inserted smart-card auth). */
export const {
  enterPin,
  logInAsSystemAdministrator,
  logInAsElectionManager,
  logInAsPollWorker,
  forceLogOutAndResetElectionDefinition,
} = buildInsertedSmartCardAuthHelpers({
  appName: 'VxMark',
  allowsCardlessVoterSessions: true,
});
