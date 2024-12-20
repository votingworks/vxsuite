import { z } from 'zod';

import { DateWithoutTime } from '@votingworks/basics';
import { BallotStyleId, Election, ElectionId, PrecinctId } from '../election';

/**
 * An election key identifies an election. It can be encoded in a smart card and
 * later validated to make sure a smart card is only used for the election it
 * was programmed for.
 *
 * It contains both the election ID (which should be unique) and the election
 * date (as defense in depth in case, for example, someone manually copies an
 * election definition and forgets to change the ID).
 */
export interface ElectionKey {
  id: ElectionId;
  date: DateWithoutTime;
}

/**
 * Create an {@link ElectionKey} from an {@link Election}.
 */
export function constructElectionKey(election: Election): ElectionKey {
  return {
    id: election.id,
    date: election.date,
  };
}

export interface VendorUser {
  readonly role: 'vendor';
  readonly jurisdiction: string;
}

export interface SystemAdministratorUser {
  readonly role: 'system_administrator';
  readonly jurisdiction: string;
}

export interface ElectionManagerUser {
  readonly role: 'election_manager';
  readonly jurisdiction: string;
  readonly electionKey: ElectionKey;
}

export interface PollWorkerUser {
  readonly role: 'poll_worker';
  readonly jurisdiction: string;
  readonly electionKey: ElectionKey;
}

export interface CardlessVoterUser {
  readonly role: 'cardless_voter';
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
  readonly sessionId: string;
}

export type User =
  | VendorUser
  | SystemAdministratorUser
  | ElectionManagerUser
  | PollWorkerUser
  | CardlessVoterUser;

export type UserWithCard = Exclude<User, CardlessVoterUser>;

export type UserRole = User['role'];

export const UserRoleSchema: z.ZodSchema<UserRole> = z.union([
  z.literal('vendor'),
  z.literal('system_administrator'),
  z.literal('election_manager'),
  z.literal('poll_worker'),
  z.literal('cardless_voter'),
]);

/**
 * See libs/auth/src/lockout.ts for more context.
 */
export type NumIncorrectPinAttemptsAllowedBeforeCardLockout =
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10;
export const NumIncorrectPinAttemptsAllowedBeforeCardLockoutSchema: z.ZodSchema<NumIncorrectPinAttemptsAllowedBeforeCardLockout> =
  z.union([
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
  ]);
export const DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT: NumIncorrectPinAttemptsAllowedBeforeCardLockout = 5;

/**
 * See libs/auth/src/lockout.ts for more context.
 */
export type StartingCardLockoutDurationSeconds = 15 | 30 | 60;
export const StartingCardLockoutDurationSecondsSchema: z.ZodSchema<StartingCardLockoutDurationSeconds> =
  z.union([z.literal(15), z.literal(30), z.literal(60)]);
export const DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS: StartingCardLockoutDurationSeconds = 15;

/**
 * The inactive/idle session time limit, after which the user must reauthenticate - a VVSG2
 * requirement
 */
export type InactiveSessionTimeLimitMinutes = 10 | 15 | 20 | 30 | 360;
export const InactiveSessionTimeLimitMinutesSchema: z.ZodSchema<InactiveSessionTimeLimitMinutes> =
  z.union([
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    // Allow significantly increasing the inactive session time limit for cert/pre-cert testing,
    // which can involve long-running exports
    // TODO: Pause the inactive session time limit timer during export operations
    z.literal(360),
  ]);
export const DEFAULT_INACTIVE_SESSION_TIME_LIMIT_MINUTES: InactiveSessionTimeLimitMinutes = 30;

/**
 * The overall session time limit, after which the user must reauthenticate - a VVSG2 requirement
 */
export type OverallSessionTimeLimitHours =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12;
export const OverallSessionTimeLimitHoursSchema: z.ZodSchema<OverallSessionTimeLimitHours> =
  z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
    z.literal(11),
    z.literal(12),
  ]);
export const DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS: OverallSessionTimeLimitHours = 12;

/**
 * The output of the signed hash validation QR code generation function
 */
export interface SignedHashValidationQrCodeValue {
  qrCodeValue: string;
  qrCodeInputs: {
    combinedElectionHash: string;
    date: Date;
    machineId: string;
    softwareVersion: string;
    systemHash: string;
  };
}

/**
 * The machine ID in dev certs.
 *
 * We define this here instead of in @votingworks/auth so that it can be imported by frontends,
 * too.
 */
export const DEV_MACHINE_ID = '0000';

/**
 * The jurisdiction used across tests.
 *
 * We define this here instead of in @votingworks/auth so that it can be imported by
 * @votingworks/test-utils without creating a circular dependency.
 *
 * And we define it here instead of in @votingworks/test-utils so that it can be imported by app
 * source code, e.g. for integration tests, without having to move @votingworks/test-utils from dev
 * dependencies to non-dev dependencies.
 */
export const TEST_JURISDICTION = 'jurisdiction';
