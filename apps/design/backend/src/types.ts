import {
  LanguageCode,
  ElectionType,
  ElectionId,
  Election,
  ContestId,
  LiveReportVotingType,
  PrecinctSelection,
  PollsTransitionType,
} from '@votingworks/types';
import { DateWithoutTime } from '@votingworks/basics';
import { ContestResults } from '@votingworks/types/src/tabulation';
import { z } from 'zod/v4';
import { baseUrl } from './globals';

export const StateCodes = ['DEMO', 'MS', 'NH'] as const;
export type StateCode = (typeof StateCodes)[number];
export const StateCodeSchema: z.ZodType<StateCode> = z.enum(StateCodes);

export interface Organization {
  id: string;
  name: string;
}

export interface Jurisdiction {
  id: string;
  name: string;
  stateCode: StateCode;
  organization: Organization;
}

interface UserBase {
  id: string;
  /**
   * The user's name is generally defaulted to their email address due to the
   * way we create users, but we still use the name field to make it clear that
   * this is what should be displayed as their identity.
   */
  name: string;
  organization: Organization;
}

export interface JurisdictionUser extends UserBase {
  type: 'jurisdiction_user';
  jurisdictions: Jurisdiction[];
}

export interface OrganizationUser extends UserBase {
  type: 'organization_user';
}

export interface SupportUser extends UserBase {
  type: 'support_user';
}

export type User = JurisdictionUser | OrganizationUser | SupportUser;
export type UserType = User['type'];

export type ExternalElectionSource = 'ms-sems';

export type ElectionStatus =
  | 'notStarted'
  | 'inProgress'
  | 'ballotsFinalized'
  | 'ballotsApproved';

export interface ElectionListing {
  jurisdictionId: string;
  jurisdictionName: string;
  electionId: ElectionId;
  title: string;
  date: DateWithoutTime;
  type: ElectionType;
  countyName: string;
  state: string;
  status: ElectionStatus;
  externalSource?: ExternalElectionSource;
}

export interface ElectionInfo {
  jurisdictionId: string;
  electionId: ElectionId;
  type: ElectionType;
  date: DateWithoutTime;
  title: string;
  state: string;
  countyName: string;
  seal: string;
  languageCodes: LanguageCode[];
  signatureImage?: string;
  signatureCaption?: string;
  externalSource?: ExternalElectionSource;
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
  pollsTransitionType: PollsTransitionType;
  isPartial: boolean;
  ballotHash: string;
  machineId: string;
  isLive: boolean;
  reportCreatedAt?: Date;
  pollsTransitionTime?: Date;
  election: Election;
  precinctSelection: PrecinctSelection;
  votingType: LiveReportVotingType;
}

export interface ReceivedPollsOpenReportInfo extends ReceivedReportInfoBase {
  pollsTransitionType: 'open_polls';
  isPartial: false;
  ballotCount?: number;
}

export interface ReceivedVotingResumedReportInfo
  extends ReceivedReportInfoBase {
  pollsTransitionType: 'resume_voting';
  isPartial: false;
  ballotCount?: number;
}

export interface ReceivedPollsPausedReportInfo extends ReceivedReportInfoBase {
  pollsTransitionType: 'pause_voting';
  isPartial: false;
  ballotCount?: number;
}

export interface ReceivedPollsClosedPartialReportInfo
  extends ReceivedReportInfoBase {
  pollsTransitionType: 'close_polls';
  isPartial: true;
  numPages: number;
  pageIndex: number;
}

export interface ReceivedPollsClosedFinalReportInfo
  extends ReceivedReportInfoBase {
  pollsTransitionType: 'close_polls';
  isPartial: false;
  contestResults: Record<ContestId, ContestResults>;
}

export type ReceivedReportInfo =
  | ReceivedPollsOpenReportInfo
  | ReceivedVotingResumedReportInfo
  | ReceivedPollsPausedReportInfo
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
  pollsTransitionType: PollsTransitionType;
}

export const ALL_PRECINCTS_REPORT_KEY = '';

export type GetExportedElectionError =
  | 'no-election-export-found'
  | 'election-out-of-date';

export type ResultsReportingError =
  | 'invalid-payload'
  | 'invalid-signature'
  | GetExportedElectionError;

export const RESULTS_REPORTING_PATH = '/report';
export type ResultsReportingPath = typeof RESULTS_REPORTING_PATH;

export function resultsReportingUrl(): string {
  return new URL(RESULTS_REPORTING_PATH, baseUrl()).toString();
}

/**
 * Status of a QA run triggered via CircleCI.
 */
export type ExportQaStatus = 'pending' | 'in_progress' | 'success' | 'failure';

/**
 * Information about a QA run for an exported election+ballots package.
 */
export interface ExportQaRun {
  id: string;
  electionId: ElectionId;
  exportPackageUrl: string;
  circleCiPipelineId?: string;
  circleCiWorkflowId?: string;
  status: ExportQaStatus;
  statusMessage?: string;
  resultsUrl?: string;
  jobUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parameters for updating a QA run status via webhook.
 */
export interface UpdateQaRunStatusParams {
  status: ExportQaStatus;
  statusMessage?: string;
  resultsUrl?: string;
  circleCiWorkflowId?: string;
  jobUrl?: string;
}
