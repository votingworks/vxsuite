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
export interface PrecinctSplit {
  districtIds: readonly DistrictId[];
  id: Id;
  name: string;

  /** A title that overrides the election title at the top of the ballot.
   * Use when precinct splits are used to represent separate simultaneous elections
   * eg. in New Hampshire school board elections.
   */
  // TODO(kevin) union with NhPrecinctSplitOptions
  electionTitle?: string;

  clerkSignatureImage?: string;
  clerkSignatureCaption?: string;
}
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
  deliveryAddress?: string;
  deliveryRecipientName?: string;
  precinctBallotColor?: string;
  precinctBallotCount?: string;
  shouldAbsenteeBallotsBeScoredForFolding?: boolean;
}

export const BallotOrderInfoSchema: z.ZodType<BallotOrderInfo> = z.object({
  absenteeBallotCount: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryRecipientName: z.string().optional(),
  precinctBallotColor: z.string().optional(),
  precinctBallotCount: z.string().optional(),
  shouldAbsenteeBallotsBeScoredForFolding: z.boolean().optional(),
});
