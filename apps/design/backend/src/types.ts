import z from 'zod/v4';
import {
  BallotStyle as VxfBallotStyle,
  BallotStyleId,
  DistrictId,
  PartyId,
  BallotStyleGroupId,
  LanguageCode,
  PrecinctOrSplitId,
  ElectionType,
  ElectionId,
} from '@votingworks/types';
import { DateWithoutTime } from '@votingworks/basics';

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

// [TODO] Flesh out as needed.
export interface User {
  orgId: string;
  orgName?: string;
}

export interface Org {
  displayName: string;
  id: string;
  name: string;
}

export type ElectionStatus =
  | 'notStarted'
  | 'inProgress'
  | 'ballotsFinalized'
  | 'orderSubmitted';

export interface ElectionListing {
  orgId: string;
  orgName: string;
  electionId: ElectionId;
  title: string;
  date: DateWithoutTime;
  type: ElectionType;
  jurisdiction: string;
  state: string;
  status: ElectionStatus;
}

export interface ElectionInfo {
  electionId: ElectionId;
  type: ElectionType;
  date: DateWithoutTime;
  title: string;
  state: string;
  jurisdiction: string;
  seal: string;
  languageCodes: LanguageCode[];
}
