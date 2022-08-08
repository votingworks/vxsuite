import * as z from 'zod';
import { BallotStyleId, PrecinctId } from '../election';
import { ElectionHash, IdSchema, Optional } from '../generic';
import { Result } from '../result';

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
export interface VoterUser {
  readonly role: 'voter';
  readonly createdAt: number;
  readonly ballotStyleId: string;
  readonly precinctId: string;
  readonly voidedAt?: number;
  readonly ballotPrintedAt?: number;
  readonly updatedAt?: number;
  readonly markMachineId?: string;
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
  | VoterUser
  | CardlessVoterUser;

export type UserRole = User['role'];
export const UserRoleSchema: z.ZodSchema<UserRole> = z.union([
  z.literal('voter'),
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

export interface VoterCardData extends CardData {
  readonly t: 'voter';
  /** Created date */
  readonly c: number;
  /** Ballot style ID */
  readonly bs: string;
  /** Precinct ID */
  readonly pr: string;
  /** Used (voided) */
  readonly uz?: number;
  /** Ballot printed date */
  readonly bp?: number;
  /** Updated date */
  readonly u?: number;
  /** Mark machine ID */
  readonly m?: string;
}
export const VoterCardDataSchema: z.ZodSchema<VoterCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('voter'),
    c: z.number(),
    bs: IdSchema,
    pr: IdSchema,
    uz: z.number().optional(),
    bp: z.number().optional(),
    u: z.number().optional(),
    m: IdSchema.optional(),
  });

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
  | VoterCardData
  | PollWorkerCardData
  | ElectionManagerCardData
  | SystemAdministratorCardData;
export const AnyCardDataSchema: z.ZodSchema<AnyCardData> = z.union([
  VoterCardDataSchema,
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
