import React, { useContext } from 'react'
import { useLocation } from 'react-router-dom'


import AppContext from '../contexts/AppContext'

import { routerPaths } from './ElectionManager'
import Screen from './Screen'
import Main, { MainChild } from './Main'
import Navigation from './Navigation'
import LinkButton from './LinkButton'

interface Props {
  children: React.ReactNode
  mainChildCenter?: boolean
  mainChildFlex?: boolean
}

const NavigationScreen = ({
  children,
  mainChildCenter = false,
  mainChildFlex = false
}: Props) => {
  const location = useLocation()
  const isActiveSection = (path: string) =>
    new RegExp('^' + path).test(location.pathname) ? 'active-section' : ''

  const { election: e } = useContext(AppContext)
  const election = e!

  return (
    <Screen>
      <Main padded>
        <MainChild center={mainChildCenter} flexContainer={mainChildFlex}>
          {children}
        </MainChild>
      </Main>
      <Navigation
        primaryNav={
          election && (
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
              <LinkButton small to={routerPaths.testDecksResults}
                className={isActiveSection(routerPaths.testDecksResults)}
              >
                Test Deck Results
              </LinkButton>
              <LinkButton small to={routerPaths.smartCards}
                className={isActiveSection(routerPaths.smartCards)}
              >
                SmartCards
              </LinkButton>
            </React.Fragment>
          )
        }
      />
    </Screen>
  )
}

export default NavigationScreen
