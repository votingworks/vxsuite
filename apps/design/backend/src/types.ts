import { NhPrecinctSplitOptions } from '@votingworks/hmpb';
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
