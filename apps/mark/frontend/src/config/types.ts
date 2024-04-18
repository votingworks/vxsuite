import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-backend';
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
  generateBallotId: () => string;
  isCardlessVoter: boolean;
  isLiveMode: boolean;
  endVoterSession: () => Promise<void>;
  precinctId?: PrecinctId;
  resetBallot: (showPostVotingInstructions?: boolean) => void;
  updateTally: () => void;
  updateVote: UpdateVoteFunction;
  votes: VotesDict;
}
