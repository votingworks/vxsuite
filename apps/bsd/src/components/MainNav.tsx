import React from 'react'
import styled from 'styled-components'
import { Election } from '@votingworks/ballot-encoder'

import Text from './Text'
import { localeWeedkayAndDate } from '../util/IntlDateTimeFormats'

const StyledMainNav = styled.div`
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  background: #455a64;
  order: -1;
`

const Brand = styled.div`
  display: inline-block;
  margin: 0.75rem 1rem;
  white-space: nowrap;
  color: #ffffff;
  font-size: 1.3rem;
  font-weight: 600;
  & span {
    font-weight: 400;
  }
`
const MakeName = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
`
const ModelName = styled.div``

const ElectionInfo = styled.div`
  text-align: center;
`
const NavButtons = styled.div`
  margin-right: 1em;
  button {
    margin-left: 0.5em;
  }
`

const TestMode = styled.span`
  color: #ff8c00;
`

interface Props {
  children?: React.ReactNode
  isTestMode?: boolean
  election?: Election
  electionHash?: string
}

const MainNav = ({
  children,
  isTestMode = false,
  election,
  electionHash,
}: Props) => {
  const electionDate =
    election && localeWeedkayAndDate.format(new Date(election?.date))

  return (
    <StyledMainNav>
      <Brand>
        <MakeName>
          Voting<span>Works</span>
        </MakeName>
        <ModelName>
          Ballot Scanner
          {isTestMode && <TestMode>&nbsp;TEST&nbsp;MODE</TestMode>}
        </ModelName>
      </Brand>
      {election && electionHash && (
        <ElectionInfo>
          <Text white small as="div">
            <strong>{election?.title}</strong>{' '}
            {electionHash && `(${electionHash.slice(0, 10)})`}
            <br />
            {electionDate}
            <br />
            {election?.county.name}, {election?.state}
          </Text>
        </ElectionInfo>
      )}
      <NavButtons>{children}</NavButtons>
    </StyledMainNav>
  )
}
export default MainNav
