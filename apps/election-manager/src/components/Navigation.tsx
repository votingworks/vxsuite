import React from 'react'
import styled from 'styled-components'

interface Props {
  brand?: React.ReactNode
  primaryNav?: React.ReactNode
  secondaryNav?: React.ReactNode
}

const NavBar = styled.div`
  display: flex;
  align-items: flex-end;
  background-color: #333333;
  min-height: 3rem;
  color: #ffffff;
`
const Brand = styled.div`
  display: inline-block;
  margin: 0 1rem 0.35rem;
  white-space: nowrap;
  color: #ffffff;
  font-family: 'Vx Helvetica Neue Condensed'; /* stylelint-disable-line font-family-no-missing-generic-family-keyword */
  & span {
    font-weight: 400;
  }
`
const MakeName = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
`

const ModelName = styled.div``

const PrimaryNav = styled.div`
  display: flex;
  align-items: flex-end;
  margin-right: auto;
  & > * {
    margin: 0 0.25rem;
    &:first-child {
      margin-left: 0;
    }
    &:last-child {
      margin-right: 0;
    }
  }
  button {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    background: #888888;
    padding: 0.35rem 1rem 0.25rem;
    color: #ffffff;
    &.active-section {
      background: #edeff0;
      color: #000000;
    }
  }
`
const SecondaryNav = styled.div`
  align-self: center;
  margin: 0 1rem;
  & > * {
    margin: 0 0.25rem;
    &:first-child {
      margin-left: 0;
    }
    &:last-child {
      margin-right: 0;
    }
  }
`

const Navigation = ({
  brand, // eslint-disable-line @typescript-eslint/no-unused-vars
  primaryNav,
  secondaryNav,
}: Props) => {
  return (
    <NavBar>
      <Brand>
        <MakeName>VxPaper</MakeName>
        <ModelName>Election Manager</ModelName>
      </Brand>
      <PrimaryNav>{primaryNav}</PrimaryNav>
      {secondaryNav && <SecondaryNav>{secondaryNav}</SecondaryNav>}
    </NavBar>
  )
}

export default Navigation
