import {
  BallotStyleId,
  CandidateContest,
  CandidateVote,
  ContestId,
  Contests,
  Election,
  ElectionDefinition,
  MachineId,
  MsEitherNeitherContest,
  OptionalVote,
  OptionalYesNoVote,
  PrecinctId,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';
import { z } from 'zod';

// App
export const PrintOnly = {
  key: 'PrintOnly',
  productName: 'VxPrint',
  isMark: false,
  isPrint: true,
} as const;
export const MarkOnly = {
  key: 'MarkOnly',
  productName: 'VxMark',
  isMark: true,
  isPrint: false,
} as const;
export const MarkAndPrint = {
  key: 'MarkAndPrint',
  productName: 'VxMark',
  isPrint: true,
  isMark: true,
} as const;
export type AppMode = typeof MarkOnly | typeof PrintOnly | typeof MarkAndPrint;
export type AppModeKeys = AppMode['key'];
export const AppModeKeysSchema: z.ZodSchema<AppModeKeys> = z.union([
  z.literal(PrintOnly.key),
  z.literal(MarkOnly.key),
  z.literal(MarkAndPrint.key),
]);

export type ScreenOrientation = 'portrait' | 'landscape';

export interface MachineConfig {
  machineId: string;
  appMode: AppMode;
  codeVersion: string;
  screenOrientation: ScreenOrientation;
}

export interface MachineConfigResponse {
  machineId: string;
  appModeKey: AppModeKeys;
  codeVersion: string;
  screenOrientation: ScreenOrientation;
}
export const MachineConfigResponseSchema: z.ZodSchema<MachineConfigResponse> =
  z.object({
    machineId: MachineId,
    appModeKey: AppModeKeysSchema,
    codeVersion: z.string().nonempty(),
    screenOrientation: z.union([z.literal('portrait'), z.literal('landscape')]),
  });

export function getAppMode(key: AppModeKeys): AppMode {
  switch (key) {
    case PrintOnly.key:
      return PrintOnly;
    case MarkOnly.key:
      return MarkOnly;
    case MarkAndPrint.key:
      return MarkAndPrint;
    default:
      throw new Error(`unknown app mode: ${key}`);
  }
}

export type PostVotingInstructions = 'card' | 'cardless';

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void;
export type InputChangeEventFunction =
  React.ChangeEventHandler<HTMLInputElement>;
export type TextareaChangeEventFunction =
  React.ChangeEventHandler<HTMLTextAreaElement>;
export type SelectChangeEventFunction =
  React.ChangeEventHandler<HTMLSelectElement>;

// Ballot
export type UpdateVoteFunction = (
  contestId: ContestId,
  vote: OptionalVote
) => void;
export type MarkVoterCardFunction = () => Promise<boolean>;
export interface BallotContextInterface {
  machineConfig: MachineConfig;
  ballotStyleId?: BallotStyleId;
  contests: Contests;
  readonly electionDefinition?: ElectionDefinition;
  isCardlessVoter: boolean;
  isLiveMode: boolean;
  markVoterCardPrinted: MarkVoterCardFunction;
  markVoterCardVoided: MarkVoterCardFunction;
  precinctId?: PrecinctId;
  resetBallot: (instructions?: PostVotingInstructions) => void;
  setUserSettings: SetUserSettings;
  updateTally: () => void;
  updateVote: UpdateVoteFunction;
  forceSaveVote: () => void;
  userSettings: UserSettings;
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
  vote: OptionalYesNoVote;
}
export interface MsEitherNeitherContestResultInterface {
  contest: MsEitherNeitherContest;
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

export type TextSizeSetting = 0 | 1 | 2 | 3;

export interface UserSettings {
  showSettingsModal: boolean;
  textSize: TextSizeSetting;
}
export type SetUserSettings = (partial: PartialUserSettings) => void;
export type PartialUserSettings = Partial<UserSettings>;

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
   * Call this with an event target when a focus event occurs. Resolves when speaking is done.
   */
  onFocus(target?: EventTarget): Promise<void>;

  /**
   * Call this with an event target when a click event occurs. Resolves when speaking is done.
   */
  onClick(target?: EventTarget): Promise<void>;

  /**
   * Call this when a page load occurs. Resolves when speaking is done.
   */
  onPageLoad(): Promise<void>;

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

  /**
   * Directly triggers speech of an element. Resolves when speaking is done.
   */
  speakNode(element: Element, options?: SpeakOptions): Promise<void>;

  /**
   * Directly triggers speech of an event target. Resolves when speaking is done.
   */
  speakEventTarget(target?: EventTarget, options?: SpeakOptions): Promise<void>;

  /**
   * Changes the current volume setting either up or down.
   */
  changeVolume(): void;
}

export interface VoiceSelector {
  (): SpeechSynthesisVoice | undefined;
}
