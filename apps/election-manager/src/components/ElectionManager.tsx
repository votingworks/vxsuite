import React, { useContext } from 'react'
import { Switch, Route, Redirect } from 'react-router-dom'

import AppContext from '../contexts/AppContext'

import ElectionEditDefinitionScreen from '../screens/ElectionEditDefinitionScreen'
import BallotListScreen from '../screens/BallotListScreen'
import BallotScreen from '../screens/BallotScreen'
import ExportElectionBallotPackageScreen from '../screens/ExportElectionBallotPackageScreen'
import UnconfiguredScreen from '../screens/UnconfiguredScreen'
import TestDeckScreen from '../screens/TestDeckScreen'
import TallyScreen from '../screens/TallyScreen'
import TallyReportScreen from '../screens/TallyReportScreen'

import routerPaths from '../routerPaths'

const ElectionManager = () => {
  const { election: e } = useContext(AppContext)
  const election = e!

  if (!election) {
    return <UnconfiguredScreen />
  }

  return (
    <Switch>
      <Route path={routerPaths.electionDefinition}>
        <ElectionEditDefinitionScreen />
      </Route>
      <Route exact path={routerPaths.ballotsList}>
        <BallotListScreen />
      </Route>
      <Route
        path={[
          routerPaths.testDeckResultsReport({ precinctId: ':precinctId' }),
          routerPaths.testDecksTally,
        ]}
      >
        <TestDeckScreen />
      </Route>
      <Route
        path={[
          routerPaths.ballotsViewLanguage({
            ballotStyleId: ':ballotStyleId',
            precinctId: ':precinctId',
            localeCode: ':localeCode',
          }),
          routerPaths.ballotsView({
            ballotStyleId: ':ballotStyleId',
            precinctId: ':precinctId',
          }),
        ]}
      >
        <BallotScreen />
      </Route>
      <Route exact path={routerPaths.export}>
        <ExportElectionBallotPackageScreen />
      </Route>
      <Route exact path={routerPaths.tally}>
        <TallyScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyPrecinctReport({ precinctId: ':precinctId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyScannerReport({ scannerId: ':scannerId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Redirect to={routerPaths.ballotsList} />
    </Switch>
  )
}

export default ElectionManager
