import React, { useContext } from 'react'
import { Switch, Route, Redirect } from 'react-router-dom'


import { BallotScreenProps, PrecinctReportScreenProps } from '../config/types'

import AppContext from '../contexts/AppContext'

import ElectionEditDefinitionScreen from '../screens/ElectionEditDefinitionScreen'
import BallotListScreen from '../screens/BallotListScreen'
import BallotScreen from '../screens/BallotScreen'
import ExportElectionBallotPackageScreen from '../screens/ExportElectionBallotPackageScreen'
import UnconfiguredScreen from '../screens/UnconfiguredScreen'
import TestDeckScreen from '../screens/TestDeckScreen'
import TallyScreen from '../screens/TallyScreen'
import TallyReportScreen from '../screens/TallyReportScreen'

export const routerPaths = {
  root: '/',
  electionDefinition: '/definition',
  ballotsList: '/ballots',
  ballotsView: ({ ballotStyleId, precinctId }: BallotScreenProps) =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}`,
  tally: `/tally`,
  tallyReport: ({ precinctId }: PrecinctReportScreenProps) =>
    `/tally/precinct/${precinctId}`,
  tallyFullReport: `/tally/full`,
  testDecksTally: '/tally/test-ballot-deck',
  testDeckResultsReport: ({ precinctId }: PrecinctReportScreenProps) =>
    `/tally/test-ballot-deck/${precinctId}`,
  export: '/export-election-ballot-package',
}

const ElectionManager = () => {
  const { election: e } = useContext(AppContext)
  const election = e!

  if (!election) {
    return (
      <UnconfiguredScreen />
    )
  }

  return (
    <Switch>
      <Route path={routerPaths.electionDefinition}>
        <ElectionEditDefinitionScreen />
      </Route>
      <Route exact path={routerPaths.ballotsList}>
        <BallotListScreen />
      </Route>
      <Route path={[
        routerPaths.testDeckResultsReport({ precinctId: ':precinctId' }),
        routerPaths.testDecksTally,
      ]}>
        <TestDeckScreen />
      </Route>
      <Route
        path={routerPaths.ballotsView({
          ballotStyleId: ':ballotStyleId',
          precinctId: ':precinctId',
        })}
      >
        <BallotScreen />
      </Route>
      <Route exact path={routerPaths.export}>
        <ExportElectionBallotPackageScreen />
      </Route>
      <Route exact path={routerPaths.tally}>
        <TallyScreen />
      </Route>
      <Route path={[
        routerPaths.tallyReport({ precinctId: ':precinctId' }),
        routerPaths.tallyFullReport,
      ]}>
        <TallyReportScreen />
      </Route>
      <Redirect to={routerPaths.ballotsList} />
    </Switch>
  )
}

export default ElectionManager
