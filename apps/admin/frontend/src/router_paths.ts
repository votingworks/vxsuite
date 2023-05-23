import { ContestId } from '@votingworks/types';
import {
  PartyReportScreenProps,
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
  VotingMethodReportScreenProps,
  ManualDataEntryScreenProps,
  BatchReportScreenProps,
  SmartcardsScreenProps,
} from './config/types';

export const routerPaths = {
  root: '/',
  advanced: '/advanced',
  electionDefinition: '/definition',
  definitionEditor: '/definition/editor',
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
    ballotType,
  }: ManualDataEntryScreenProps): string =>
    `/tally/manual-data-entry/${ballotStyleId}/${ballotType}/${precinctId}`,
  reports: '/reports',
  tally: '/tally',
  tallyPrecinctReport: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/reports/tally-reports/precincts/${precinctId}`,
  tallyPartyReport: ({ partyId }: PartyReportScreenProps): string =>
    `/reports/tally-reports/parties/${partyId}`,
  tallyVotingMethodReport: ({
    votingMethod,
  }: VotingMethodReportScreenProps): string =>
    `/reports/tally-reports/votingmethods/${votingMethod}`,
  tallyScannerReport: ({ scannerId }: ScannerReportScreenProps): string =>
    `/reports/tally-reports/scanners/${scannerId}`,
  tallyBatchReport: ({ batchId }: BatchReportScreenProps): string =>
    `/reports/tally-reports/batches/${batchId}`,
  tallyFullReport: '/reports/tally-reports/full',
  tallyWriteInReport: '/reports/tally-reports/writein',
  logicAndAccuracy: '/logic-and-accuracy',
  testDecks: '/logic-and-accuracy/test-decks',
  writeIns: '/write-ins',
  settings: '/settings',
  logs: '/logs',
} as const;
