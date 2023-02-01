import {
  DippedSmartCardAuth,
  ElectionDefinition,
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
} from '@votingworks/types';
import { Result } from '@votingworks/basics';

/**
 * The API for a dipped smart card auth instance, "dipped" meaning that the card needs to be
 * inserted and removed from the card reader to complete authentication
 */
export interface DippedSmartCardAuthApi {
  getAuthStatus: () => DippedSmartCardAuth.AuthStatus;

  checkPin: (input: { pin: string }) => void;
  logOut: () => void;

  programCard: (input: {
    userRole:
      | SystemAdministratorUser['role']
      | ElectionManagerUser['role']
      | PollWorkerUser['role'];
  }) => Promise<Result<{ pin?: string }, Error>>;
  unprogramCard: () => Promise<Result<void, Error>>;

  setElectionDefinition: (electionDefinition: ElectionDefinition) => void;
  clearElectionDefinition: () => void;
}

/**
 * Configuration parameters for a dipped smart card auth instance
 */
export interface DippedSmartCardAuthConfig {
  allowElectionManagersToAccessUnconfiguredMachines?: boolean;
  electionDefinition?: ElectionDefinition;
}
