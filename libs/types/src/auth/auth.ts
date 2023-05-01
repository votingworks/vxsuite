import { z } from 'zod';

import { BallotStyleId, PrecinctId } from '../election';

export interface SystemAdministratorUser {
  readonly role: 'system_administrator';
  readonly jurisdiction: string;
}

export interface ElectionManagerUser {
  readonly role: 'election_manager';
  readonly jurisdiction: string;
  readonly electionHash: string;
}

export interface PollWorkerUser {
  readonly role: 'poll_worker';
  readonly jurisdiction: string;
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

export type UserWithCard = Exclude<User, CardlessVoterUser>;

export type UserRole = User['role'];

export const UserRoleSchema: z.ZodSchema<UserRole> = z.union([
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
export const NumIncorrectPinAttemptsAllowedBeforeCardLockoutSchema = z
  .number()
  .min(3)
  .max(10)
  .step(1) as z.ZodSchema<NumIncorrectPinAttemptsAllowedBeforeCardLockout>;
export const DEFAULT_NUM_INCORRECT_PIN_ATTEMPTS_ALLOWED_BEFORE_CARD_LOCKOUT: NumIncorrectPinAttemptsAllowedBeforeCardLockout = 5;

/**
 * See libs/auth/src/lockout.ts for more context.
 */
export type StartingCardLockoutDurationSeconds = 15 | 30 | 60;
export const StartingCardLockoutDurationSecondsSchema = z.union([
  z.number().min(15).max(15),
  z.number().min(30).max(30),
  z.number().min(60).max(60),
]) as z.ZodSchema<StartingCardLockoutDurationSeconds>;
export const DEFAULT_STARTING_CARD_LOCKOUT_DURATION_SECONDS: StartingCardLockoutDurationSeconds = 15;

/**
 * The inactive/idle session time limit, after which the user must reauthenticate - a VVSG2
 * requirement
 */
export type InactiveSessionTimeLimitMinutes = 5 | 10 | 15 | 20 | 30;
export const InactiveSessionTimeLimitMinutesSchema = z.union([
  z.number().min(5).max(5),
  z.number().min(10).max(10),
  z.number().min(15).max(15),
  z.number().min(20).max(20),
  z.number().min(30).max(30),
]) as z.ZodSchema<InactiveSessionTimeLimitMinutes>;
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
export const OverallSessionTimeLimitHoursSchema = z
  .number()
  .min(1)
  .max(12)
  .step(1) as z.ZodSchema<OverallSessionTimeLimitHours>;
export const DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS: OverallSessionTimeLimitHours = 12;

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
