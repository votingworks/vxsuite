import {
  ContestAdjudicationScreenParams,
  ManualTallyFormContestParams,
  ManualTallyFormParams,
} from './config/types';

export const routerPaths = {
  root: '/',
  advanced: '/advanced',
  election: '/election',
  smartcards: '/smartcards',
  tally: '/tally',
  tallyCvrs: '/tally/cvrs',
  tallyManual: '/tally/manual',
  tallyManualForm: ({
    precinctId,
    ballotStyleGroupId,
    votingMethod,
  }: ManualTallyFormParams): string =>
    `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}`,
  tallyManualFormContest: ({
    precinctId,
    ballotStyleGroupId,
    votingMethod,
    contestId,
  }: ManualTallyFormContestParams): string =>
    `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/${contestId}`,
  reports: '/reports',
  tallyFullReport: '/reports/tally/full',
  tallySinglePrecinctReport: `/reports/tally/precinct`,
  tallyAllPrecinctsReport: `/reports/tally/all-precincts`,
  tallyReportBuilder: `/reports/tally/builder`,
  ballotCountReportBuilder: `/reports/ballot-count/builder`,
  ballotCountReportPrecinct: '/reports/ballot-count/precinct',
  ballotCountReportVotingMethod: '/reports/ballot-count/voting-method',
  tallyWriteInReport: '/reports/tally-reports/writein',
  adjudication: '/adjudication',
  contestAdjudicationSummary: '/adjudication/contests',
  contestAdjudication: ({
    contestId,
  }: ContestAdjudicationScreenParams): string =>
    `/adjudication/contests/${contestId}`,
  ballotAdjudication: `/adjudication/ballots`,
  settings: '/settings',
  hardwareDiagnostics: '/hardware-diagnostics',
  system: '/system',
} as const;
