import React from 'react'
import { Switch, Route, Redirect } from 'react-router-dom'
import { useLocation } from 'react-router-dom'

import { BallotScreenProps } from '../config/types'

import Screen from './Screen'
import Main from './Main'
import Navigation from './Navigation'
import ElectionEditDefinitionScreen from '../screens/ElectionEditDefinitionScreen'
import BallotListScreen from '../screens/BallotListScreen'
import BallotScreen from '../screens/BallotScreen'
import ExportElectionBallotPackageScreen from '../screens/ExportElectionBallotPackageScreen'
import LinkButton from './LinkButton'

export const routerPaths = {
  root: '/',
  electionDefinition: '/definition',
  ballotsList: '/ballots',
  ballotsView: ({ ballotStyleId, precinctId }: BallotScreenProps) =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}`,
  export: '/export',
}

const ElectionManager = () => {
  const location = useLocation()
  const isActiveSection = (path: string) =>
    new RegExp('^' + path).test(location.pathname) ? 'active-section' : ''

  return (
    <Screen>
      <Main padded>
        <Switch>
          <Route
            path={routerPaths.electionDefinition}
            component={ElectionEditDefinitionScreen}
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
          <Route
            path={routerPaths.export}
            component={ExportElectionBallotPackageScreen}
          />
          <Redirect to={routerPaths.ballotsList} />
        </Switch>
      </Main>
      <Navigation
        primaryNav={
          <React.Fragment>
            <LinkButton
              to={routerPaths.electionDefinition}
              className={isActiveSection(routerPaths.electionDefinition)}
            >
              Definition
            </LinkButton>
            <LinkButton
              to={routerPaths.ballotsList}
              className={isActiveSection(routerPaths.ballotsList)}
            >
              Ballots
            </LinkButton>
          </React.Fragment>
        }
      />
    </Screen>
  )
}

export default ElectionManager
