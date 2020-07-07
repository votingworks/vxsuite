import {
  BallotScreenProps,
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
} from './config/types'

const routerPaths = {
  root: '/',
  electionDefinition: '/definition',
  ballotsList: '/ballots',
  ballotsView: ({ ballotStyleId, precinctId }: BallotScreenProps) =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}`,
  ballotsViewLanguage: ({
    ballotStyleId,
    precinctId,
    localeCode,
  }: BallotScreenProps) =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}/language/${localeCode}`,
  tally: '/tally',
  tallyPrecinctReport: ({ precinctId }: PrecinctReportScreenProps) =>
    `/tally/precinct/${precinctId}`,
  tallyScannerReport: ({ scannerId }: ScannerReportScreenProps) =>
    `/tally/scanner/${scannerId}`,
  tallyFullReport: '/tally/full',
  testDecksTally: '/tally/test-ballot-deck',
  testDeckResultsReport: ({ precinctId }: PrecinctReportScreenProps) =>
    `/tally/test-ballot-deck/${precinctId}`,
  export: '/export-election-ballot-package',
}

export default routerPaths
