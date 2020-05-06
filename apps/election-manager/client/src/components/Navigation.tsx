import React from 'react'
import styled from 'styled-components'
import LinkButton from './LinkButton'
import { useLocation } from 'react-router-dom'

import { routerPaths } from './ElectionManager'

interface Props {
  foo?: string
}

const NavBar = styled.div<Props>`
  display: flex;
  align-items: center;
  background-color: #333333;
  color: #ffffff;
`
const Brand = styled.div`
  display: inline-block;
  margin: 1rem 0.25rem;
  white-space: nowrap;
  color: #ffffff;
  font-size: 1.3rem;
  font-weight: 600;
  & span {
    font-weight: 400;
  }
`
const PrimaryNav = styled.div`
  margin-right: auto;
`
const SecondaryNav = styled.div``

const Navigation = () => {
  const location = useLocation()

  return (
    <NavBar>
      <PrimaryNav>
        <Brand>Election Manager</Brand>
        <LinkButton
          small
          to={routerPaths.electionConfig}
          primary={location.pathname === routerPaths.electionConfig}
        >
          Config
        </LinkButton>{' '}
        <LinkButton
          small
          to={routerPaths.ballotsList}
          primary={location.pathname === routerPaths.ballotsList}
        >
          Ballots
        </LinkButton>
      </PrimaryNav>
      <SecondaryNav>
        {/* <LinkButton small to={routerPaths.export}>
        Export Package
      </LinkButton> */}
      </SecondaryNav>
    </NavBar>
  )
}

export default Navigation
