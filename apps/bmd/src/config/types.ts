import {
  BallotStyle,
  BallotStyleId,
  CandidateContest,
  CandidateVote,
  ContestId,
  Contests,
  ElectionDefinition,
  MachineId,
  MsEitherNeitherContest,
  OptionalVote,
  OptionalYesNoVote,
  Parties,
  Precinct,
  PrecinctId,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';
import { z } from 'zod';

// App
export const VxPrintOnly = {
  name: 'VxPrint',
  isVxMark: false,
  isVxPrint: true,
} as const;
export const VxMarkOnly = {
  name: 'VxMark',
  isVxMark: true,
  isVxPrint: false,
} as const;
export const VxMarkPlusVxPrint = {
  name: 'VxMark + VxPrint',
  isVxPrint: true,
  isVxMark: true,
} as const;
export type AppMode =
  | typeof VxMarkOnly
  | typeof VxPrintOnly
  | typeof VxMarkPlusVxPrint;
export type AppModeNames = AppMode['name'];
export const AppModeNamesSchema: z.ZodSchema<AppModeNames> = z.union([
  z.literal(VxPrintOnly.name),
  z.literal(VxMarkOnly.name),
  z.literal(VxMarkPlusVxPrint.name),
]);

export interface MachineConfig {
  machineId: string;
  appMode: AppMode;
  codeVersion: string;
}

export interface MachineConfigResponse {
  machineId: string;
  appModeName: AppModeNames;
  codeVersion: string;
}
export const MachineConfigResponseSchema: z.ZodSchema<MachineConfigResponse> = z.object(
  {
    machineId: MachineId,
    appModeName: AppModeNamesSchema,
    codeVersion: z.string().nonempty(),
  }
);

export function getAppMode(name: AppModeNames): AppMode {
  switch (name) {
    case VxPrintOnly.name:
      return VxPrintOnly;
    case VxMarkOnly.name:
      return VxMarkOnly;
    case VxMarkPlusVxPrint.name:
      return VxMarkPlusVxPrint;
    default:
      throw new Error(`unknown app mode: ${name}`);
  }
}

export type PostVotingInstructions = 'card' | 'cardless';

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void;
export type InputChangeEventFunction = React.ChangeEventHandler<HTMLInputElement>;
export type TextareaChangeEventFunction = React.ChangeEventHandler<HTMLTextAreaElement>;
export type SelectChangeEventFunction = React.ChangeEventHandler<HTMLSelectElement>;

// Election
export interface ActivationData {
  ballotStyle: BallotStyle;
  precinct: Precinct;
}

export interface SerializableActivationData {
  ballotStyleId: BallotStyleId;
  isCardlessVoter: boolean;
  precinctId: PrecinctId;
}

export enum PrecinctSelectionKind {
  SinglePrecinct = 'SinglePrecinct',
  AllPrecincts = 'AllPrecincts',
}

export type PrecinctSelection =
  | { kind: PrecinctSelectionKind.AllPrecincts }
  | { kind: PrecinctSelectionKind.SinglePrecinct; precinctId: Precinct['id'] };

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
  printer: Printer;
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
  parties: Parties;
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
  sides: Exclude<KioskBrowser.PrintOptions['sides'], undefined>;
}
export interface Printer {
  print(options: PrintOptions): Promise<void>;
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
}

export interface VoiceSelector {
  (): SpeechSynthesisVoice | undefined;
}
