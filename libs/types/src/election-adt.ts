export interface State {
  name(): string;
}

export interface County {
  name(): string;
}

export interface District {
  name(): string;
}

export interface Precinct {
  name(): string;
}

export interface Party {
  name(): string;
  abbreviation(): string;
}

type ContestType = 'candidate' | 'ballot-measure' | 'ms-either-neither';

interface BaseContest {
  readonly type: ContestType;
  title(): string;
  party(): Party | undefined;
}

export interface CandidateContest extends BaseContest {
  readonly type: 'candidate';
  votesAllowed(): number; // Replaces seats
  candidates(): readonly Candidate[];
  allowWriteIns(): boolean;
  rotation(): Rotation | undefined;
}

export interface Candidate {
  name(): string;
  party(): Party | undefined;
  // TODO do we need these fields in election def?
  // isWriteIn?: boolean;
  // writeInIndex?: number;
}

export interface Rotation {
  type: 'candidateShiftByPrecinctIndex';
}

export interface BallotMeasureContest {
  readonly type: 'ballot-measure';
  description(): string;
  shortTitle(): string | undefined;
  options(): readonly BallotMeasureOption[]; // Replaces yesOption/noOption
}

export interface BallotMeasureOption {
  label(): string;
}

export type Contest = CandidateContest | BallotMeasureContest;

export interface BallotStyle {
  precincts(): readonly Precinct[];
  contests(): readonly Contest[];
  party(): Party | undefined;
}

export interface Election {
  // Logical election
  title(): string;
  date(): string;
  state(): State;
  county(): County;
  districts(): readonly District[];
  precincts(): readonly Precinct[];
  parties(): readonly Party[];
  contests(): readonly Contest[];
  ballotStyles(): readonly BallotStyle[];

  // // Physical ballot
  // ballotLayout(): BallotLayout | undefined;
  // gridLayouts(): readonly GridLayout[] | undefined;
  // seal(): string | undefined;
  // sealUrl(): string | undefined;
  // quickResultsReportingUrl(): string | undefined;

  // // Localization
  // _lang(): Translations | undefined;
  // ballotStrings(): BallotStrings | undefined;

  // // Election settings
  // markThresholds(): MarkThresholds | undefined;
  // centralScanAdjudicationReasons(): readonly AdjudicationReason[] | undefined;
  // precinctScanAdjudicationReasons(): readonly AdjudicationReason[] | undefined;
}
