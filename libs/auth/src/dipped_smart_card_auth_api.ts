import { Result } from '@votingworks/basics';
import {
  DippedSmartCardAuth,
  ElectionKey,
  ElectionManagerUser,
  NumIncorrectPinAttemptsAllowedBeforeCardLockout,
  OverallSessionTimeLimitHours,
  PollWorkerUser,
  StartingCardLockoutDurationSeconds,
  SystemAdministratorUser,
  VendorUser,
} from '@votingworks/types';

/**
 * The API for a dipped smart card auth instance, "dipped" meaning that the card needs to be
 * inserted and removed from the card reader for the user to be authenticated
 */
export interface DippedSmartCardAuthApi {
  getAuthStatus(
    machineState: DippedSmartCardAuthMachineState
  ): Promise<DippedSmartCardAuth.AuthStatus>;

  checkPin(
    machineState: DippedSmartCardAuthMachineState,
    input: { pin: string }
  ): Promise<void>;
  logOut(machineState: DippedSmartCardAuthMachineState): Promise<void>;
  updateSessionExpiry(
    machineState: DippedSmartCardAuthMachineState,
    input: { sessionExpiresAt: Date }
  ): Promise<void>;

  programCard(
    machineState: DippedSmartCardAuthMachineState,
    input:
      | { userRole: VendorUser['role'] }
      | { userRole: SystemAdministratorUser['role'] }
      | { userRole: ElectionManagerUser['role'] }
      | { userRole: PollWorkerUser['role'] }
  ): Promise<Result<{ pin?: string }, Error>>;
  unprogramCard(
    machineState: DippedSmartCardAuthMachineState
  ): Promise<Result<void, Error>>;
}

/**
 * Configuration parameters for a dipped smart card auth instance
 */
export interface DippedSmartCardAuthConfig {
  allowElectionManagersToAccessUnconfiguredMachines?: boolean;
}

/**
 * Machine state that the consumer is responsible for providing
 */
export interface DippedSmartCardAuthMachineState {
  electionKey?: ElectionKey;
  jurisdiction?: string;
  arePollWorkerCardPinsEnabled: boolean;
  numIncorrectPinAttemptsAllowedBeforeCardLockout: NumIncorrectPinAttemptsAllowedBeforeCardLockout;
  overallSessionTimeLimitHours: OverallSessionTimeLimitHours;
  startingCardLockoutDurationSeconds: StartingCardLockoutDurationSeconds;
}
