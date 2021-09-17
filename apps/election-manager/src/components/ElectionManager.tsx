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
import OvervoteCombinationReportScreen from '../screens/OvervoteCombinationReportScreen'
import DefinitionEditorScreen from '../screens/DefinitionEditorScreen'
import DefinitionContestsScreen from '../screens/DefinitionContestsScreen'
import PrintedBallotsReportScreen from '../screens/PrintedBallotsReportScreen'
import ManualDataImportIndexScreen from '../screens/ManualDataImportIndexScreen'
import ManualDataImportPrecinctScreen from '../screens/ManualDataImportPrecinctScreen'
import SmartcardsScreen from '../screens/SmartcardsScreen'
import { MachineLockedScreen } from '../screens/MachineLockedScreen'
import { InvalidCardScreen } from '../screens/InvalidCardScreen'
import { UnlockMachineScreen } from '../screens/UnlockMachineScreen'

const ElectionManager = (): JSX.Element => {
  const { electionDefinition, currentUserSession } = useContext(AppContext)
  const election = electionDefinition?.election

  if (!election) {
    return <UnconfiguredScreen />
  }

  if (!currentUserSession) {
    return <MachineLockedScreen />
  }

  if (currentUserSession.type !== 'admin') {
    return <InvalidCardScreen />
  }

  if (!currentUserSession.authenticated) {
    return <UnlockMachineScreen />
  }

  return (
    <Switch>
      <Route exact path={routerPaths.electionDefinition}>
        <DefinitionScreen />
      </Route>
      <Route path={routerPaths.definitionEditor}>
        <DefinitionEditorScreen allowEditing={false} />
      </Route>
      <Route path={routerPaths.definitionContest({ contestId: ':contestId' })}>
        <DefinitionContestsScreen allowEditing={false} />
      </Route>
      <Route path={routerPaths.smartcards}>
        <SmartcardsScreen />
      </Route>
      <Route exact path={routerPaths.ballotsList}>
        <BallotListScreen />
      </Route>
      <Route exact path={routerPaths.printedBallotsReport}>
        <PrintedBallotsReportScreen />
      </Route>
      <Route exact path={routerPaths.manualDataImport}>
        <ManualDataImportIndexScreen />
      </Route>
      <Route
        path={routerPaths.manualDataImportForPrecinct({
          precinctId: ':precinctId',
        })}
      >
        <ManualDataImportPrecinctScreen />
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
      <Route
        path={[
          routerPaths.tallyPartyReport({ partyId: ':partyId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyBatchReport({ batchId: ':batchId' }),
          routerPaths.tallyFullReport,
        ]}
      >
        <TallyReportScreen />
      </Route>
      <Route
        path={[
          routerPaths.tallyVotingMethodReport({
            votingMethod: ':votingMethod',
          }),
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
