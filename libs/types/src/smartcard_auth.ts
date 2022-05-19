import * as z from 'zod';
import { ElectionHash, IdSchema, Optional } from './generic';
import { Result } from './result';

// User data types
export interface SuperadminUser {
  readonly role: 'superadmin';
}
export interface AdminUser {
  readonly role: 'admin';
  readonly electionHash: string;
  readonly passcode?: string;
}
export interface PollworkerUser {
  readonly role: 'pollworker';
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
export type User = SuperadminUser | AdminUser | PollworkerUser | VoterUser;

export type UserRole = User['role'];
export const UserRoleSchema: z.ZodSchema<UserRole> = z.union([
  z.literal('voter'),
  z.literal('pollworker'),
  z.literal('admin'),
  z.literal('superadmin'),
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

export interface PollworkerCardData extends CardData {
  readonly t: 'pollworker';
  /** Election hash */
  readonly h: string;
}
export const PollworkerCardDataSchema: z.ZodSchema<PollworkerCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('pollworker'),
    h: ElectionHash,
  });

export interface AdminCardData extends CardData {
  readonly t: 'admin';
  /** Election hash */
  readonly h: string;
  /** Card Passcode */
  readonly p?: string;
}
export const AdminCardDataSchema: z.ZodSchema<AdminCardData> =
  CardDataInternalSchema.extend({
    t: z.literal('admin'),
    h: ElectionHash,
    p: z.string().optional(),
  });

/**
 * Beginning of the SuperAdmin card schema. More will be added to this as we fully flesh out this role
 * This is a minimal implementation for the purposes of rebooting from usb.
 */
export interface SuperadminCardData extends CardData {
  readonly t: 'superadmin';
}
export const SuperadminCardDataSchema: z.ZodSchema<SuperadminCardData> =
  CardDataInternalSchema.extend({ t: z.literal('superadmin') });

export type AnyCardData =
  | VoterCardData
  | PollworkerCardData
  | AdminCardData
  | SuperadminCardData;
export const AnyCardDataSchema: z.ZodSchema<AnyCardData> = z.union([
  VoterCardDataSchema,
  PollworkerCardDataSchema,
  AdminCardDataSchema,
  SuperadminCardDataSchema,
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

// Auth status types
export interface LoggedOutAuth {
  readonly status: 'logged_out';
  readonly reason:
    | 'no_card'
    | 'card_error'
    | 'invalid_user_on_card'
    | 'user_role_not_allowed'
    | 'machine_not_configured'
    | 'pollworker_election_hash_mismatch';
}

export interface SuperadminLoggedInAuth {
  readonly status: 'logged_in';
  readonly user: SuperadminUser;
  readonly card: CardStorage;
}

export interface AdminLoggedInAuth {
  readonly status: 'logged_in';
  readonly user: AdminUser;
  readonly card: CardStorage;
}

export interface PollworkerLoggedInAuth {
  readonly status: 'logged_in';
  readonly user: PollworkerUser;
  readonly card: CardStorage;
}

export interface VoterLoggedInAuth {
  readonly status: 'logged_in';
  readonly user: VoterUser;
  readonly card: CardStorage;
}

export type LoggedInAuth =
  | SuperadminLoggedInAuth
  | AdminLoggedInAuth
  | PollworkerLoggedInAuth
  | VoterLoggedInAuth;

export type SmartcardAuth = LoggedOutAuth | LoggedInAuth;
