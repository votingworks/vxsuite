import { z } from 'zod';

import { BallotStyleId, PrecinctId } from '../election';

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
  z.literal('system_administrator'),
  z.literal('election_manager'),
  z.literal('poll_worker'),
  z.literal('cardless_voter'),
]);
