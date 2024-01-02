import {
  BallotStyleId,
  CandidateContest,
  CandidateVote,
  ContestId,
  Election,
  ElectionDefinition,
  OptionalVote,
  OptionalYesNoVote,
  PrecinctId,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';
import { ButtonPressEvent } from '@votingworks/ui';
import {
  ContestsWithMsEitherNeither,
  MsEitherNeitherContest,
} from '../utils/ms_either_neither_contests';

export enum VoteUpdateInteractionMethod {
  Touch = 'touch',
  AssistiveTechnologyDevice = 'assistive_technology_device',
  Mouse = 'mouse',
}

export function getInteractionMethod(
  event: ButtonPressEvent
): VoteUpdateInteractionMethod {
  if (event.detail === 0) {
    /* istanbul ignore next - react-testing-library/userEvent pointer API was added in 14.0.0; we are on 13.x.x */
    if ((event as React.TouchEvent<HTMLButtonElement>).touches) {
      return VoteUpdateInteractionMethod.Touch;
    }

    return VoteUpdateInteractionMethod.AssistiveTechnologyDevice;
  }

  return VoteUpdateInteractionMethod.Mouse;
}

// Ballot
export type UpdateVoteFunction = (
  contestId: ContestId,
  vote: OptionalVote,
  interactionMethod: VoteUpdateInteractionMethod
) => void;

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

// Review and Printed Ballot
export interface CandidateContestResultInterface {
  contest: CandidateContest;
  election: Election;
  precinctId: PrecinctId;
  vote: CandidateVote;
}
export interface YesNoContestResultInterface {
  contest: YesNoContest;
  election: Election;
  vote: OptionalYesNoVote;
}
export interface MsEitherNeitherContestResultInterface {
  contest: MsEitherNeitherContest;
  election: Election;
  eitherNeitherContestVote: OptionalYesNoVote;
  pickOneContestVote: OptionalYesNoVote;
}

// Machine Config
export interface MachineConfig {
  machineId: string;
  codeVersion: string;
  screenOrientation: ScreenOrientation;
}

export type ScreenOrientation = 'portrait' | 'landscape';
