import {
  LanguageCode,
  ElectionType,
  ElectionId,
  Election,
  ContestId,
  PrecinctSelection,
  PollsStateSupportsLiveReporting,
} from '@votingworks/types';
import { DateWithoutTime } from '@votingworks/basics';
import { ContestResults } from '@votingworks/types/src/tabulation';

export enum UsState {
  NEW_HAMPSHIRE = 'New Hampshire',
  MISSISSIPPI = 'Mississippi',
  UNKNOWN = 'Unknown',
}

export function normalizeState(state: string): UsState {
  switch (state.toLowerCase()) {
    case 'nh':
    case 'new hampshire':
    case 'state of new hampshire':
      return UsState.NEW_HAMPSHIRE;
    case 'ms':
    case 'mississippi':
    case 'state of mississippi':
      return UsState.MISSISSIPPI;
    default:
      return UsState.UNKNOWN;
  }
}

export interface User {
  /**
   * The user's name is generally defaulted to their email address due to the
   * way we create users, but we still use the name field to make it clear that
   * this is what should be displayed as their identity.
   */
  name: string;
  auth0Id: string;
  orgId: string;
}

export interface Org {
  name: string;
  id: string;
}

export type ElectionStatus = 'notStarted' | 'inProgress' | 'ballotsFinalized';

export interface ElectionListing {
  orgId: string;
  orgName: string;
  electionId: ElectionId;
  title: string;
  date: DateWithoutTime;
  type: ElectionType;
  jurisdiction: string;
  state: string;
  status: ElectionStatus;
}

export interface ElectionInfo {
  orgId: string;
  electionId: ElectionId;
  type: ElectionType;
  date: DateWithoutTime;
  title: string;
  state: string;
  jurisdiction: string;
  seal: string;
  languageCodes: LanguageCode[];
  signatureImage?: string;
  signatureCaption?: string;
}

export type ElectionUpload =
  | {
      format: 'vxf';
      electionFileContents: string;
    }
  | {
      format: 'ms-sems';
      electionFileContents: string;
      candidateFileContents: string;
    };

// Live Reports types

export interface ReceivedReportInfoBase {
  pollsState: PollsStateSupportsLiveReporting;
  isPartial: boolean;
  ballotHash: string;
  machineId: string;
  isLive: boolean;
  signedTimestamp: Date;
  election: Election;
  precinctSelection: PrecinctSelection;
}

export interface ReceivedPollsOpenReportInfo extends ReceivedReportInfoBase {
  pollsState: 'polls_open';
  isPartial: false;
}

export interface ReceivedPollsClosedPartialReportInfo
  extends ReceivedReportInfoBase {
  pollsState: 'polls_closed_final';
  isPartial: true;
  numPages: number;
  pageIndex: number;
}

export interface ReceivedPollsClosedFinalReportInfo
  extends ReceivedReportInfoBase {
  pollsState: 'polls_closed_final';
  isPartial: false;
  contestResults: Record<ContestId, ContestResults>;
}

export type ReceivedReportInfo =
  | ReceivedPollsOpenReportInfo
  | ReceivedPollsClosedPartialReportInfo
  | ReceivedPollsClosedFinalReportInfo;

export interface AggregatedReportedResults {
  ballotHash: string;
  contestResults: Record<ContestId, ContestResults>;
  election: Election;
  machinesReporting: string[];
  isLive: boolean;
}

export interface AggregatedReportedPollsStatus {
  reportsByPrecinct: Record<string, QuickReportedPollStatus[]>;
  election: Election;
  isLive: boolean;
  ballotHash: string;
}

export interface QuickReportedPollStatus {
  machineId: string;
  precinctSelection: PrecinctSelection;
  signedTimestamp: Date;
  pollsState: PollsStateSupportsLiveReporting;
}

export const ALL_PRECINCTS_REPORT_KEY = '';

export type GetExportedElectionError =
  | 'no-election-export-found'
  | 'election-out-of-date';

export type ResultsReportingError =
  | 'invalid-payload'
  | 'invalid-signature'
  | GetExportedElectionError;
