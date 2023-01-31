import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';

/**
 * The API for a dipped smart card auth instance, "dipped" meaning that the card needs to be
 * inserted and removed from the card reader to complete authentication
 */
export interface DippedSmartCardAuthApi {
  getAuthStatus: () => DippedSmartCardAuth.AuthStatus;

  checkPin: (input: { pin: string }) => void;
  logOut: () => void;

  programCard: DippedSmartCardAuth.ProgramCard;
  unprogramCard: DippedSmartCardAuth.UnprogramCard;

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
