import React from 'react'
import Screen from '../components/Screen'
import Main from '../components/Main'
import Navigation from './Navigation'
import { Switch, Route } from 'react-router-dom'

import { BallotScreenProps } from '../config/types'

import ElectionConfigScreen from '../screens/ElectionConfigScreen'
import BallotListScreen from '../screens/BallotListScreen'
import BallotScreen from '../screens/BallotScreen'

export const routerPaths = {
  root: '/',
  electionConfig: '/config',
  ballotsList: '/ballots',
  ballotsView: ({ ballotStyleId, precinctId }: BallotScreenProps) =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}`,
  export: '/export',
}

const ElectionManager = () => (
  <React.Fragment>
    <Screen>
      <Main padded>
        <Switch>
          <Route
            path={routerPaths.electionConfig}
            component={ElectionConfigScreen}
          />
          <Route
            path={routerPaths.ballotsList}
            exact
            component={BallotListScreen}
          />
          <Route
            path={routerPaths.ballotsView({
              ballotStyleId: ':ballotStyleId',
              precinctId: ':precinctId',
            })}
            component={BallotScreen}
          />
          <Route component={BallotListScreen} />
        </Switch>
      </Main>
      <Navigation />
    </Screen>
    <div id="print-ballot" />
  </React.Fragment>
)

export default ElectionManager
