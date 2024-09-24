import {
  ManualDataEntryScreenProps,
  WriteInsAdjudicationScreenProps,
} from './config/types';

export const routerPaths = {
  root: '/',
  advanced: '/advanced',
  election: '/election',
  smartcards: '/smartcards',
  manualDataSummary: '/tally/manual-data-summary',
  manualDataEntry: ({
    precinctId,
    ballotStyleId,
    votingMethod,
  }: ManualDataEntryScreenProps): string =>
    `/tally/manual-data-entry/${ballotStyleId}/${votingMethod}/${precinctId}`,
  reports: '/reports',
  tally: '/tally',
  tallyFullReport: '/reports/tally/full',
  tallySinglePrecinctReport: `/reports/tally/precinct`,
  tallyAllPrecinctsReport: `/reports/tally/all-precincts`,
  tallyReportBuilder: `/reports/tally/builder`,
  ballotCountReportBuilder: `/reports/ballot-count/builder`,
  ballotCountReportPrecinct: '/reports/ballot-count/precinct',
  ballotCountReportVotingMethod: '/reports/ballot-count/voting-method',
  tallyWriteInReport: '/reports/tally-reports/writein',
  writeIns: '/write-ins',
  writeInsAdjudication: ({
    contestId,
  }: WriteInsAdjudicationScreenProps): string =>
    `/write-ins/adjudication/${contestId}`,
  settings: '/settings',
  hardwareDiagnostics: '/hardware-diagnostics',
  system: '/system',
} as const;
