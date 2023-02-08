import * as z from 'zod';
import { Result } from '@votingworks/basics';
import { BallotStyleId, PrecinctId } from '../election';
import { ElectionHash, Optional } from '../generic';

// User data types
export interface SystemAdministratorUser {
  readonly role: 'system_administrator';
  readonly passcode: string;
}
export interface ElectionManagerUser {
  readonly role: 'election_manager';
  readonly electionHash: string;
  readonly passcode: string;
}
export interface PollWorkerUser {
  readonly role: 'poll_worker';
  readonly electionHash: string;
}
export interface CardlessVoterUser {
  readonly role: 'cardless_voter';
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
}
export type User =
  | SystemAdministratorUser
  | ElectionManagerUser
  | PollWorkerUser
  | CardlessVoterUser;

export type UserRole = User['role'];
export const UserRoleSchema: z.ZodSchema<UserRole> = z.union([
  z.literal('poll_worker'),
  z.literal('election_manager'),
  z.literal('system_administrator'),
]);

// Smartcard data types
// These correspond to user data types but use shorter field names to save space.
export interface CardData {
  readonly t: UserRole;
}
const CardDataInternalSchema = z.object({
  t: UserRoleSchema,
});
export const CardDataSchema: z.ZodSchema<CardData> = CardDataInternalSchema;

export interface PollWorkerCardData extends CardData {
  readonly t: 'poll_worker';
  /** Election hash */
  readonly h: string;
}
export const PollWorkerCardDataSchema: z.ZodSchema<PollWorkerCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('poll_worker'),
    h: ElectionHash,
  });

export interface ElectionManagerCardData extends CardData {
  readonly t: 'election_manager';
  /** Election hash */
  readonly h: string;
  /** Card Passcode */
  readonly p: string;
}
export const ElectionManagerCardDataSchema: z.ZodSchema<ElectionManagerCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('election_manager'),
    h: ElectionHash,
    p: z.string(),
  });

export interface SystemAdministratorCardData extends CardData {
  readonly t: 'system_administrator';
  /** Card Passcode */
  readonly p: string;
}
export const SystemAdministratorCardDataSchema: z.ZodSchema<SystemAdministratorCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('system_administrator'),
    p: z.string(),
  });

export type AnyCardData =
  | PollWorkerCardData
  | ElectionManagerCardData
  | SystemAdministratorCardData;
export const AnyCardDataSchema: z.ZodSchema<AnyCardData> = z.union([
  PollWorkerCardDataSchema,
  ElectionManagerCardDataSchema,
  SystemAdministratorCardDataSchema,
]);

// Card interface types
export interface CardStorage {
  readonly hasStoredData: boolean;
  readonly readStoredObject: <T>(
    schema: z.ZodSchema<T>
  ) => Promise<Result<Optional<T>, SyntaxError | z.ZodError>>;
  readonly readStoredString: () => Promise<Result<Optional<string>, Error>>;
  readonly readStoredUint8Array: () => Promise<
    Result<Optional<Uint8Array>, Error>
  >;
  readonly writeStoredData: (
    value: unknown | Uint8Array
  ) => Promise<Result<void, Error>>;
  readonly clearStoredData: () => Promise<Result<void, Error>>;
}

export interface CardProgramming {
  readonly programmedUser?: User;
  readonly programUser: (
    userData:
      | SystemAdministratorUser
      | (ElectionManagerUser & { electionData: string })
      | PollWorkerUser
  ) => Promise<Result<void, Error>>;
  readonly unprogramUser: () => Promise<Result<void, Error>>;
}
