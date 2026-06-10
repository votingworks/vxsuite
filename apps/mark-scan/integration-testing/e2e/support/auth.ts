import { buildInsertedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

/**
 * VxMarkScan auth helpers for integration tests (inserted smart-card auth).
 * VxMarkScan renders the PIN-pad digits as plain text rather than buttons.
 */
export const {
  enterPin,
  logInAsSystemAdministrator,
  logInAsElectionManager,
  logInAsPollWorker,
  forceLogOutAndResetElectionDefinition,
} = buildInsertedSmartCardAuthHelpers({
  appName: 'VxMarkScan',
  pinDigitSelector: 'text',
  endsCardlessVoterSession: true,
});
