import { ContestId } from '@votingworks/types';
import {
  PartyReportScreenProps,
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
  VotingMethodReportScreenProps,
  ManualDataEntryScreenProps,
  BatchReportScreenProps,
  SmartcardsScreenProps,
  WriteInsAdjudicationScreenProps,
} from './config/types';

export const routerPaths = {
  root: '/',
  advanced: '/advanced',
  electionDefinition: '/definition',
  definitionViewer: '/definition/viewer',
  definitionContest: ({ contestId }: { contestId: ContestId }): string =>
    `/definition/contests/${contestId}`,
  smartcards: '/smartcards',
  smartcardsByType: ({ smartcardType }: SmartcardsScreenProps): string =>
    `/smartcards/smartcard-types/${smartcardType}`,
  ballotsList: '/ballots',
  manualDataSummary: '/tally/manual-data-summary',
  manualDataEntry: ({
    precinctId,
    ballotStyleId,
    votingMethod,
  }: ManualDataEntryScreenProps): string =>
    `/tally/manual-data-entry/${ballotStyleId}/${votingMethod}/${precinctId}`,
  reports: '/reports',
  tally: '/tally',
  tallyFullReport: '/reports/tally-reports/full',
  tallyPrecinctReport: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/reports/tally-reports/precincts/${precinctId}`,
  tallyAllPrecinctsReport: `/reports/tally-reports/all-precincts`,
  tallyVotingMethodReport: ({
    votingMethod,
  }: VotingMethodReportScreenProps): string =>
    `/reports/tally-reports/votingmethods/${votingMethod}`,
  tallyPartyReport: ({ partyId }: PartyReportScreenProps): string =>
    `/reports/tally-reports/parties/${partyId}`,
  tallyScannerReport: ({ scannerId }: ScannerReportScreenProps): string =>
    `/reports/tally-reports/scanners/${scannerId}`,
  tallyBatchReport: ({ batchId }: BatchReportScreenProps): string =>
    `/reports/tally-reports/batches/${batchId}`,
  tallyReportBuilder: `/reports/tally-reports/builder`,
  tallyWriteInReport: '/reports/tally-reports/writein',
  logicAndAccuracy: '/logic-and-accuracy',
  testDecks: '/logic-and-accuracy/test-decks',
  writeIns: '/write-ins',
  writeInsAdjudication: ({
    contestId,
  }: WriteInsAdjudicationScreenProps): string =>
    `/write-ins/adjudication/${contestId}`,
  settings: '/settings',
  logs: '/logs',
  system: '/system',
} as const;
