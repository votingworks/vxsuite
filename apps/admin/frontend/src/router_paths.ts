import { ContestId } from '@votingworks/types';
import {
  ManualDataEntryScreenProps,
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
  tallySinglePrecinctReport: '/reports/tally-reports/single-precinct',
  tallyAllPrecinctsReport: `/reports/tally-reports/all-precincts`,
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
