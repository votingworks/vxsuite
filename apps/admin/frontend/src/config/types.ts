import { BallotStyleGroupId, ContestId, PrecinctId } from '@votingworks/types';
import type { ManualResultsVotingMethod } from '@votingworks/admin-backend';

// Router Params
export interface ManualTallyFormParams {
  precinctId: PrecinctId;
  ballotStyleGroupId: BallotStyleGroupId;
  votingMethod: ManualResultsVotingMethod;
}
export interface ManualTallyFormContestParams extends ManualTallyFormParams {
  contestId: ContestId;
}

export type Iso8601Timestamp = string;
