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
  color: #ffffff;
  min-height: 3rem;
`
const Brand = styled.div`
  display: inline-block;
  margin: 0 1rem 0.35rem;
  white-space: nowrap;
  color: #ffffff;
  font-family: 'Vx Helvetica Neue Condensed';
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
    border-bottom-right-radius: 0;
    border-bottom-left-radius: 0;
    padding: 0.35rem 1rem 0.25rem;
    background: #888888;
    color: #ffffff;
    &.active-section {
      background: #edeff0;
      color: #000000;
    }
  }
`
const SecondaryNav = styled.div`
  margin: 0 1rem;
  align-self: center;
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

const Navigation = ({ brand, primaryNav, secondaryNav }: Props) => {
  return (
    <NavBar>
      <Brand>
        <MakeName>VxMail</MakeName>
        <ModelName>Election Manager</ModelName>
      </Brand>
      <PrimaryNav>{primaryNav}</PrimaryNav>
      {secondaryNav && <SecondaryNav>{secondaryNav}</SecondaryNav>}
    </NavBar>
  )
}

export default Navigation
