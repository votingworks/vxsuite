import { z } from 'zod';
import { Optional, Result } from '@votingworks/basics';
import {
  BallotStyleId,
  InsertedSmartCardAuth,
  NumIncorrectPinAttemptsAllowedBeforeCardLockout,
  OverallSessionTimeLimitHours,
  PrecinctId,
  StartingCardLockoutDurationSeconds,
} from '@votingworks/types';

/**
 * The API for an inserted smart card auth instance, "inserted" meaning that the card needs to be
 * kept in the card reader for the user to remain authenticated
 */
export interface InsertedSmartCardAuthApi {
  getAuthStatus(
    machineState: InsertedSmartCardAuthMachineState
  ): Promise<InsertedSmartCardAuth.AuthStatus>;

  checkPin(
    machineState: InsertedSmartCardAuthMachineState,
    input: { pin: string }
  ): Promise<void>;
  /**
   * Though logout is typically accomplished by removing the inserted card when using inserted
   * smart card auth, this method is still useful for clearing the session and re-requiring PIN
   * entry, e.g. after the inactive session time limit has been hit.
   */
  logOut(machineState: InsertedSmartCardAuthMachineState): Promise<void>;
  updateSessionExpiry(
    machineState: InsertedSmartCardAuthMachineState,
    input: { sessionExpiresAt: Date }
  ): Promise<void>;

  startCardlessVoterSession(
    machineState: InsertedSmartCardAuthMachineState,
    input: { ballotStyleId: BallotStyleId; precinctId: PrecinctId }
  ): Promise<void>;
  endCardlessVoterSession(
    machineState: InsertedSmartCardAuthMachineState
  ): Promise<void>;

  readCardData<T>(
    machineState: InsertedSmartCardAuthMachineState,
    input: { schema: z.ZodSchema<T> }
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError | Error>>;
  readCardDataAsString(
    machineState: InsertedSmartCardAuthMachineState
  ): Promise<Result<Optional<string>, Error>>;
  writeCardData<T>(
    machineState: InsertedSmartCardAuthMachineState,
    input: { data: T; schema: z.ZodSchema<T> }
  ): Promise<Result<void, Error>>;
  clearCardData(
    machineState: InsertedSmartCardAuthMachineState
  ): Promise<Result<void, Error>>;
}

/**
 * Configuration parameters for an inserted smart card auth instance
 */
export interface InsertedSmartCardAuthConfig {
  allowCardlessVoterSessions?: boolean;
  allowElectionManagersToAccessMachinesConfiguredForOtherElections?: boolean;
}

/**
 * Machine state that the consumer is responsible for providing
 */
export interface InsertedSmartCardAuthMachineState {
  electionHash?: string;
  jurisdiction?: string;
  arePollWorkerCardPinsEnabled: boolean;
  numIncorrectPinAttemptsAllowedBeforeCardLockout: NumIncorrectPinAttemptsAllowedBeforeCardLockout;
  overallSessionTimeLimitHours: OverallSessionTimeLimitHours;
  startingCardLockoutDurationSeconds: StartingCardLockoutDurationSeconds;
}
