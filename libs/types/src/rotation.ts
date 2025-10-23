import {
  AnyOrderedContest,
  DistrictId,
  Election,
  PrecinctOrSplitId,
} from './election';

// Helper types for managing ballot style generation and contest ordering

// Input parameters for rotation and contest ordering functions, implement alongside your ballot template in libs/hmpb to define rotation for a given ballot template.
export interface RotationParams {
  election: Election;
  districtIds: readonly DistrictId[];
  precinctsOrSplits: PrecinctOrSplitId[];
}

// Return type for rotation and contest ordering functions. Defines the ordered contests for a set of precincts or splits.
export interface ContestOrderingSet {
  orderedContests: AnyOrderedContest[];
  precinctsOrSplits: PrecinctOrSplitId[];
}
