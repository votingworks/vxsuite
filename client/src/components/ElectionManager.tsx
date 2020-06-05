import React, { useContext } from 'react'
import { Switch, Route, Redirect } from 'react-router-dom'


import { BallotScreenProps } from '../config/types'

import AppContext from '../contexts/AppContext'

import ElectionEditDefinitionScreen from '../screens/ElectionEditDefinitionScreen'
import BallotListScreen from '../screens/BallotListScreen'
import BallotScreen from '../screens/BallotScreen'
import ExportElectionBallotPackageScreen from '../screens/ExportElectionBallotPackageScreen'
import UnconfiguredScreen from '../screens/UnconfiguredScreen'
import TestDeckScreen from '../screens/TestDeckScreen'
import SmartCardsScreen from '../screens/SmartCardsScreen'

export const routerPaths = {
  root: '/',
  electionDefinition: '/definition',
  testDecksResults: '/test-deck-results/',
  testDeckResultsReport: ({ precinctId }: { precinctId: string }) => `/test-deck-results/${precinctId}`,
  ballotsList: '/ballots',
  ballotsView: ({ ballotStyleId, precinctId }: BallotScreenProps) =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}`,
  smartCards: `/smartcards`,
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
        routerPaths.testDecksResults,
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
      <Route path={routerPaths.smartCards}>
        <SmartCardsScreen />
      </Route>
      <Redirect to={routerPaths.ballotsList} />
    </Switch>
  )
}

export default ElectionManager
