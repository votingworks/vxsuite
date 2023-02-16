import { z } from 'zod';
import { Result } from '@votingworks/basics';
import {
  BallotStyleId,
  InsertedSmartCardAuth,
  Optional,
  PrecinctId,
  UserRole,
} from '@votingworks/types';

/**
 * The API for an inserted smart card auth instance, "inserted" meaning that the card needs to be
 * kept in the card reader for the user to remain authenticated
 */
export interface InsertedSmartCardAuthApi {
  getAuthStatus: (
    machineState: InsertedSmartCardAuthMachineState
  ) => Promise<InsertedSmartCardAuth.AuthStatus>;

  checkPin: (
    machineState: InsertedSmartCardAuthMachineState,
    input: { pin: string }
  ) => Promise<void>;

  startCardlessVoterSession: (
    machineState: InsertedSmartCardAuthMachineState,
    input: { ballotStyleId: BallotStyleId; precinctId: PrecinctId }
  ) => Promise<void>;
  endCardlessVoterSession: (
    machineState: InsertedSmartCardAuthMachineState
  ) => Promise<void>;

  readCardData: <T>(
    machineState: InsertedSmartCardAuthMachineState,
    input: { schema: z.ZodSchema<T> }
  ) => Promise<Result<Optional<T>, SyntaxError | z.ZodError | Error>>;
  readCardDataAsString: (
    machineState: InsertedSmartCardAuthMachineState
  ) => Promise<Result<Optional<string>, Error>>;
  writeCardData: <T>(
    machineState: InsertedSmartCardAuthMachineState,
    input: { data: T; schema: z.ZodSchema<T> }
  ) => Promise<Result<void, Error>>;
  clearCardData: (
    machineState: InsertedSmartCardAuthMachineState
  ) => Promise<Result<void, Error>>;
}

/**
 * Configuration parameters for an inserted smart card auth instance
 */
export interface InsertedSmartCardAuthConfig {
  allowedUserRoles: UserRole[];
  allowElectionManagersToAccessMachinesConfiguredForOtherElections?: boolean;
}

/**
 * Machine state that the consumer is responsible for providing
 */
export interface InsertedSmartCardAuthMachineState {
  electionHash?: string;
}
