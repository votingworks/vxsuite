import { z } from 'zod';
import { Result } from '@votingworks/basics';
import {
  ElectionDefinition,
  InsertedSmartCardAuth,
  Optional,
  PrecinctSelection,
  UserRole,
} from '@votingworks/types';

/**
 * The API for an inserted smart card auth instance, "inserted" meaning that the card needs to be
 * kept in the card reader for the user to remain authenticated
 */
export interface InsertedSmartCardAuthApi {
  getAuthStatus: () => InsertedSmartCardAuth.AuthStatus;

  checkPin: (input: { pin: string }) => void;

  readCardData: <T>(input: {
    schema: z.ZodSchema<T>;
  }) => Promise<Result<Optional<T>, SyntaxError | z.ZodError | Error>>;
  writeCardData: <T>(input: {
    data: T;
    schema: z.ZodSchema<T>;
  }) => Promise<Result<void, Error>>;
  clearCardData: () => Promise<Result<void, Error>>;

  setElectionDefinition: (electionDefinition: ElectionDefinition) => void;
  clearElectionDefinition: () => void;
  setPrecinctSelection: (precinctSelection: PrecinctSelection) => void;
  clearPrecinctSelection: () => void;
}

/**
 * Configuration parameters for an inserted smart card auth instance
 */
export interface InsertedSmartCardAuthConfig {
  allowedUserRoles: UserRole[];
  allowElectionManagersToAccessMachinesConfiguredForOtherElections?: boolean;
  electionDefinition?: ElectionDefinition;
  precinctSelection?: PrecinctSelection;
}
