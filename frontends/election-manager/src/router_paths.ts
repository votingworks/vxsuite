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
  smartcards: '/cards',
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
  printedBallotsReport: '/ballots/printed-report',
  tally: '/tally',
  tallyPrecinctReport: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/tally/precinct/${precinctId}`,
  tallyPartyReport: ({ partyId }: PartyReportScreenProps): string =>
    `/tally/party/${partyId}`,
  tallyVotingMethodReport: ({
    votingMethod,
  }: VotingMethodReportScreenProps): string =>
    `/tally/votingmethod/${votingMethod}`,
  tallyScannerReport: ({ scannerId }: ScannerReportScreenProps): string =>
    `/tally/scanner/${scannerId}`,
  tallyBatchReport: ({ batchId }: BatchReportScreenProps): string =>
    `/tally/batch/${batchId}`,
  tallyFullReport: '/tally/full',
  overvoteCombinationReport: '/tally/pairs',
  logicAndAccuracy: '/logic-and-accuracy',
  printTestDecks: '/logic-and-accuracy/print-test-deck',
  printOneTestDeck: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/logic-and-accuracy/print-test-deck/${precinctId}`,
  testDecksTally: '/logic-and-accuracy/test-ballot-deck',
  testDeckResultsReport: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/logic-and-accuracy/test-ballot-deck/${precinctId}`,
} as const;
