import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-scan-backend';
import {
  ContestsWithMsEitherNeither,
  UpdateVoteFunction,
} from '@votingworks/mark-flow-ui';

// Ballot
export interface BallotContextInterface {
  machineConfig: MachineConfig;
  ballotStyleId?: BallotStyleId;
  contests: ContestsWithMsEitherNeither;
  readonly electionDefinition?: ElectionDefinition;
  isCardlessVoter: boolean;
  isLiveMode: boolean;
  endVoterSession: () => Promise<void>;
  precinctId?: PrecinctId;
  resetBallot: (showPostVotingInstructions?: boolean) => void;
  updateVote: UpdateVoteFunction;
  votes: VotesDict;
}
