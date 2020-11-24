import React, { useContext } from 'react'
import { Switch, Route, Redirect } from 'react-router-dom'

import AppContext from '../contexts/AppContext'

import routerPaths from '../routerPaths'
import DefinitionScreen from '../screens/DefinitionScreen'
import BallotListScreen from '../screens/BallotListScreen'
import BallotScreen from '../screens/BallotScreen'
import PrintTestDeckScreen from '../screens/PrintTestDeckScreen'
import UnconfiguredScreen from '../screens/UnconfiguredScreen'
import TestDeckScreen from '../screens/TestDeckScreen'
import TallyScreen from '../screens/TallyScreen'
import TallyReportScreen from '../screens/TallyReportScreen'
import CombineResultsScreen from '../screens/CombineResultsScreen'
import OvervoteCombinationReportScreen from '../screens/OvervoteCombinationReportScreen'
import DefinitionEditorScreen from '../screens/DefinitionEditorScreen'
import DefinitionContestsScreen from '../screens/DefinitionContestsScreen'
import PrintedBallotsReportScreen from '../screens/PrintedBallotsReportScreen'

const ElectionManager: React.FC = () => {
  const { electionDefinition } = useContext(AppContext)
  const election = electionDefinition?.election

  if (!election) {
    return <UnconfiguredScreen />
  }

  return (
    <Switch>
      <Route exact path={routerPaths.electionDefinition}>
        <DefinitionScreen />
      </Route>
      <Route path={routerPaths.definitionEditor}>
        <DefinitionEditorScreen />
      </Route>
      <Route path={routerPaths.definitionContest({ contestId: ':contestId' })}>
        <DefinitionContestsScreen />
      </Route>
      <Route exact path={routerPaths.ballotsList}>
        <BallotListScreen />
      </Route>
      <Route exact path={routerPaths.printedBallotsReport}>
        <PrintedBallotsReportScreen />
      </Route>
      <Route
        path={[
          routerPaths.printOneTestDeck({ precinctId: ':precinctId' }),
          routerPaths.printTestDecks,
        ]}
      >
        <PrintTestDeckScreen />
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
      <Route exact path={routerPaths.tally}>
        <TallyScreen />
      </Route>
      <Route exact path={routerPaths.combineResultsFiles}>
        <CombineResultsScreen />
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
      <Route path={routerPaths.overvoteCombinationReport}>
        <OvervoteCombinationReportScreen />
      </Route>
      <Redirect to={routerPaths.ballotsList} />
    </Switch>
  )
}

export default ElectionManager
