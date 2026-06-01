import { buildInsertedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

/** VxMarkScan auth helpers for integration tests (inserted smart-card auth). */
export const {
  logInAsSystemAdministrator,
  logInAsElectionManager,
  forceLogOutAndResetElectionDefinition,
} = buildInsertedSmartCardAuthHelpers({
  appName: 'VxMarkScan',
  pinDigitSelector: 'text',
  endsCardlessVoterSession: true,
});
