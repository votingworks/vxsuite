import React, { useContext } from 'react'
import { useLocation } from 'react-router-dom'

import { USBControllerButton } from '@votingworks/ui'
import AppContext from '../contexts/AppContext'

import routerPaths from '../routerPaths'
import Screen from './Screen'
import Main, { MainChild } from './Main'
import Navigation from './Navigation'
import LinkButton from './LinkButton'
import StatusFooter from './StatusFooter'

interface Props {
  children: React.ReactNode
  mainChildCenter?: boolean
  mainChildFlex?: boolean
}

const NavigationScreen = ({
  children,
  mainChildCenter = false,
  mainChildFlex = false,
}: Props): JSX.Element => {
  const location = useLocation()
  const isActiveSection = (path: string) =>
    new RegExp(`^${path}`).test(location.pathname) ? 'active-section' : ''

  const { electionDefinition, usbDriveEject, usbDriveStatus } = useContext(
    AppContext
  )
  const election = electionDefinition?.election

  return (
    <Screen>
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
                to={routerPaths.smartcards}
                className={isActiveSection(routerPaths.smartcards)}
              >
                Cards
              </LinkButton>
              <LinkButton
                to={routerPaths.ballotsList}
                className={isActiveSection(routerPaths.ballotsList)}
              >
                Ballots
              </LinkButton>
              <LinkButton
                small
                to={routerPaths.tally}
                className={isActiveSection(routerPaths.tally)}
              >
                Tally
              </LinkButton>
            </React.Fragment>
          )
        }
        secondaryNav={
          <USBControllerButton
            usbDriveEject={usbDriveEject}
            usbDriveStatus={usbDriveStatus}
          />
        }
      />
      <Main padded>
        <MainChild center={mainChildCenter} flexContainer={mainChildFlex}>
          {children}
        </MainChild>
      </Main>
      <StatusFooter />
    </Screen>
  )
}

export default NavigationScreen
