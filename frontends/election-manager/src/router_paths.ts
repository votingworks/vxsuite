import { ContestId } from '@votingworks/types';
import {
  BallotScreenProps,
  PartyReportScreenProps,
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
  VotingMethodReportScreenProps,
  ManualDataPrecinctScreenProps,
  BatchReportScreenProps,
} from './config/types';

export const routerPaths = {
  root: '/',
  advanced: '/advanced',
  electionDefinition: '/definition',
  definitionEditor: '/definition/editor',
  definitionContest: ({ contestId }: { contestId: ContestId }): string =>
    `/definition/contests/${contestId}`,
  smartcards: '/smartcards',
  electionSmartcards: '/smartcards/election-smartcards',
  superAdminSmartcards: '/smartcards/super-admin-smartcards',
  ballotsList: '/ballots',
  ballotsView: ({ ballotStyleId, precinctId }: BallotScreenProps): string =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}`,
  ballotsViewLanguage: ({
    ballotStyleId,
    precinctId,
    localeCode,
  }: BallotScreenProps): string =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}/language/${localeCode}`,
  manualDataImport: '/tally/manual-data-import',
  manualDataImportForPrecinct: ({
    precinctId,
  }: ManualDataPrecinctScreenProps): string =>
    `/tally/manual-data-import/precinct/${precinctId}`,
  printedBallotsReport: '/reports/printed-report',
  reports: '/reports',
  tally: '/tally',
  tallyPrecinctReport: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/reports/precinct/${precinctId}`,
  tallyPartyReport: ({ partyId }: PartyReportScreenProps): string =>
    `/reports/party/${partyId}`,
  tallyVotingMethodReport: ({
    votingMethod,
  }: VotingMethodReportScreenProps): string =>
    `/reports/votingmethod/${votingMethod}`,
  tallyScannerReport: ({ scannerId }: ScannerReportScreenProps): string =>
    `/reports/scanner/${scannerId}`,
  tallyBatchReport: ({ batchId }: BatchReportScreenProps): string =>
    `/reports/batch/${batchId}`,
  tallyFullReport: '/reports/full',
  overvoteCombinationReport: '/tally/pairs',
  logicAndAccuracy: '/logic-and-accuracy',
  testDecks: '/logic-and-accuracy/test-decks',
  writeIns: '/write-ins',
  settings: '/settings',
  logs: '/logs',
} as const;
