import z from 'zod';
import {
  BallotStyle as VxfBallotStyle,
  BallotStyleId,
  DistrictId,
  Id,
  PartyId,
  PrecinctId,
  BallotStyleGroupId,
  LanguageCode,
} from '@votingworks/types';
import { NhPrecinctSplitOptions } from '@votingworks/hmpb';

// We create new types for precincts that can be split, since the existing
// election types don't support this. We will likely want to extend the existing
// types to support it in the future, but doing it separately for now allows us
// to experiment and learn more first. We'll store these separately in the
// database and ignore Election.precincts most of the app.
export interface PrecinctWithoutSplits {
  districtIds: readonly DistrictId[];
  id: PrecinctId;
  name: string;
}
export interface PrecinctWithSplits {
  id: PrecinctId;
  name: string;
  splits: readonly PrecinctSplit[];
}
interface PrecinctSplitBase {
  districtIds: readonly DistrictId[];
  id: Id;
  name: string;
}

// NH precinct split options are stored on the Precinct itself for simplicity.
// Consider refactoring if PrecinctSplit grows to contain options for other
// states or NhPrecinctSplitOptions adds many more properties.
export type PrecinctSplit = PrecinctSplitBase & NhPrecinctSplitOptions;

export type Precinct = PrecinctWithoutSplits | PrecinctWithSplits;

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}

export interface PrecinctOrSplitId {
  precinctId: PrecinctId;
  splitId?: Id;
}

// We also create a new type for a ballot style, that can reference precincts and
// splits. We generate ballot styles on demand, so it won't be stored in the db.
export interface BallotStyle {
  districtIds: readonly DistrictId[];
  id: BallotStyleId;
  group_id: BallotStyleGroupId;
  languages: LanguageCode[];
  partyId?: PartyId;
  precinctsOrSplits: readonly PrecinctOrSplitId[];
}

export function convertToVxfBallotStyle(
  ballotStyle: BallotStyle
): VxfBallotStyle {
  return {
    id: ballotStyle.id,
    groupId: ballotStyle.group_id,
    precincts: ballotStyle.precinctsOrSplits.map((p) => p.precinctId),
    districts: ballotStyle.districtIds,
    partyId: ballotStyle.partyId,
    languages: ballotStyle.languages,
  };
}

/**
 * Ballot order info, currently fairly specific to New Hampshire. Every field is a string to allow
 * for freeform data entry and custom notes, and every field is optional as we want to avoid having
 * to run a migration if these fields change.
 */
export interface BallotOrderInfo {
  absenteeBallotCount?: string;
  ballotColor?: string;
  deliveryAddress?: string;
  deliveryRecipientName?: string;
  deliveryRecipientPhoneNumber?: string;
  orderSubmittedAt?: string;
  precinctBallotCount?: string;
  shouldAbsenteeBallotsBeScoredForFolding?: boolean;
  shouldCollateBallotPages?: boolean;
}

export const BallotOrderInfoSchema: z.ZodType<BallotOrderInfo> = z.object({
  absenteeBallotCount: z.string().optional(),
  ballotColor: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryRecipientName: z.string().optional(),
  deliveryRecipientPhoneNumber: z.string().optional(),
  orderSubmittedAt: z.string().optional(),
  precinctBallotCount: z.string().optional(),
  shouldAbsenteeBallotsBeScoredForFolding: z.boolean().optional(),
  shouldCollateBallotPages: z.boolean().optional(),
});

export enum UsState {
  NEW_HAMPSHIRE = 'New Hampshire',
  MISSISSIPPI = 'Mississippi',
  UNKNOWN = 'Unknown',
}

export function normalizeState(state: string): UsState {
  switch (state.toLowerCase()) {
    case 'nh':
    case 'new hampshire':
      return UsState.NEW_HAMPSHIRE;
    case 'ms':
    case 'mississippi':
      return UsState.MISSISSIPPI;
    default:
      return UsState.UNKNOWN;
  }
}

export interface Auth0User {
  email_verified: boolean;
  email: string;
  name: string;
  nickname?: string;
  org_id: string;
  org_name: string;
  picture?: string;
  sid: string;
  sub?: string;
  updated_at: Date;
}

// [TODO] Flesh out as needed.
export interface User {
  orgId: string;
  orgName?: string;
  isVotingWorksUser: boolean;
  isSliUser: boolean;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type WithUserInfo<T = {}> = T & {
  user: User;
};

export interface Org {
  displayName: string;
  id: string;
  name: string;
}
