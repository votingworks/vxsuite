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
import type { MachineConfig } from '@votingworks/mark-backend';
import {
  ContestsWithMsEitherNeither,
  MsEitherNeitherContest,
} from '@votingworks/mark-flow-ui';

// Ballot
export type UpdateVoteFunction = (
  contestId: ContestId,
  vote: OptionalVote
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

export interface PrintOptions extends KioskBrowser.PrintOptions {
  sides: KioskBrowser.PrintSides;
}

// User Interface
export type ScrollDirections = 'up' | 'down';
export interface ScrollShadows {
  showBottomShadow: boolean;
  showTopShadow: boolean;
}
export interface Scrollable {
  isScrollable: boolean;
}

// Screen Reader
export interface SpeakOptions {
  now?: boolean;
}

export interface TextToSpeech {
  /**
   * Directly triggers speech of text. Resolves when speaking is done.
   */
  speak(text: string, options?: SpeakOptions): Promise<void>;

  /**
   * Stops any speaking that is currently happening.
   */
  stop(): void;

  /**
   * Prevents any sound from being made but otherwise functions normally.
   */
  mute(): void;

  /**
   * Allows sounds to be made.
   */
  unmute(): void;

  /**
   * Checks whether this TTS is muted.
   */
  isMuted(): boolean;

  /**
   * Toggles muted state, or sets it according to the argument.
   */
  toggleMuted(muted?: boolean): void;

  /**
   * Changes the current volume setting either up or down.
   */
  changeVolume?(): void;
}

/**
 * Implement this to provide screen reading.
 */
export interface ScreenReader {
  /**
   * Enables the screen reader and announces the change. Resolves when speaking
   * is done.
   */
  enable(): Promise<void>;

  /**
   * Disables the screen reader and announces the change. Resolves when speaking
   * is done.
   */
  disable(): Promise<void>;

  /**
   * Toggles the screen reader being enabled and announces the change. Resolves
   * when speaking is done.
   */
  toggle(enabled?: boolean): Promise<void>;

  /**
   * Prevents any sound from being made but otherwise functions normally.
   */
  mute(): void;

  /**
   * Allows sounds to be made.
   */
  unmute(): void;

  /**
   * Checks whether this TTS is muted.
   */
  isMuted(): boolean;

  /**
   * Toggles muted state, or sets it according to the argument.
   */
  toggleMuted(muted?: boolean): void;

  /**
   * Directly triggers speech of text. Resolves when speaking is done.
   */
  speak(text: string, options?: SpeakOptions): Promise<void>;
}

export interface VoiceSelector {
  (): SpeechSynthesisVoice | undefined;
}
