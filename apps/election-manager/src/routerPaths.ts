import {
  BallotScreenProps,
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
} from './config/types'

const routerPaths = {
  root: '/',
  electionDefinition: '/definition',
  definitionEditor: '/definition/editor',
  definitionContest: ({ contestId }: { contestId: string }): string =>
    `/definition/contests/${contestId}`,
  ballotsList: '/ballots',
  ballotsView: ({ ballotStyleId, precinctId }: BallotScreenProps): string =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}`,
  ballotsViewLanguage: ({
    ballotStyleId,
    precinctId,
    localeCode,
  }: BallotScreenProps): string =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}/language/${localeCode}`,
  printedBallotsReport: '/ballots/printed-report',
  tally: '/tally',
  printTestDecks: '/tally/print-test-deck',
  printOneTestDeck: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/tally/print-test-deck/${precinctId}`,
  tallyPrecinctReport: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/tally/precinct/${precinctId}`,
  tallyScannerReport: ({ scannerId }: ScannerReportScreenProps): string =>
    `/tally/scanner/${scannerId}`,
  tallyFullReport: '/tally/full',
  testDecksTally: '/tally/test-ballot-deck',
  testDeckResultsReport: ({ precinctId }: PrecinctReportScreenProps): string =>
    `/tally/test-ballot-deck/${precinctId}`,
  overvoteCombinationReport: '/tally/pairs',
  export: '/export-election-ballot-package',
  combineResultsFiles: '/tally/combine-results-files',
}

export default routerPaths
