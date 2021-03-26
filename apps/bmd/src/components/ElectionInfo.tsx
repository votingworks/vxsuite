import React from 'react'
import styled from 'styled-components'

import {
  ElectionDefinition,
  Precinct,
  getPartyPrimaryAdjectiveFromBallotStyle,
} from '@votingworks/types'
import { dateLong } from '../utils/date'

import Seal from './Seal'
import Prose from './Prose'
import Text, { NoWrap } from './Text'
import { MachineConfig } from '../config/types'

const VerticalContainer = styled.div`
  display: block;
  margin: auto;
  div:first-child {
    margin: 0 auto 0.5rem;
  }
`

const CenterinBlock = styled.div`
  display: flex;
  margin: 1.5rem 1rem 0;
`

const HorizontalContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: auto;
  div:first-child {
    margin-right: 1rem;
    min-width: 5rem;
  }
`

interface Props {
  precinctId: string
  ballotStyleId?: string
  electionDefinition: ElectionDefinition
  machineConfig: MachineConfig
  horizontal?: boolean
  showElectionHash?: boolean
}

const ElectionInfo: React.FC<Props> = ({
  precinctId,
  ballotStyleId,
  electionDefinition,
  machineConfig,
  horizontal = false,
  showElectionHash = false,
}) => {
  const { election, electionHash } = electionDefinition
  const { title: t, state, county, date, seal, sealURL } = election
  const precinct = election.precincts.find(
    (p) => p.id === precinctId
  ) as Precinct
  const partyPrimaryAdjective = ballotStyleId
    ? getPartyPrimaryAdjectiveFromBallotStyle({
        election,
        ballotStyleId,
      })
    : ''
  const title = `${partyPrimaryAdjective} ${t}`
  if (horizontal) {
    return (
      <CenterinBlock aria-hidden data-testid="election-info">
        <HorizontalContainer>
          <Seal seal={seal} sealURL={sealURL} />
          <Prose compact>
            <h5 aria-label={`${title}.`}>{title}</h5>
            <Text small>
              {dateLong(date)}
              <br />
              <NoWrap>{county.name},</NoWrap> <NoWrap>{state}</NoWrap>
            </Text>
            <Text small light>
              {precinct && (
                <NoWrap>
                  {precinct.name}
                  {ballotStyleId && ', '}
                </NoWrap>
              )}{' '}
              {ballotStyleId && <NoWrap>ballot style {ballotStyleId}</NoWrap>}
              {showElectionHash && (
                <React.Fragment>
                  <br />
                  Election ID: {electionHash.substring(0, 10)}
                </React.Fragment>
              )}
              <React.Fragment>
                <NoWrap>
                  <br /> Machine ID: {machineConfig.machineId}
                </NoWrap>
              </React.Fragment>
            </Text>
          </Prose>
        </HorizontalContainer>
      </CenterinBlock>
    )
  }
  return (
    <VerticalContainer aria-hidden>
      <Seal seal={seal} sealURL={sealURL} />
      <Prose textCenter>
        <h1 aria-label={`${title}.`}>{title}</h1>
        <p>
          {dateLong(date)}
          <br />
          {county.name}
          <br />
          {state}
        </p>
        <Text bold>{precinct.name}</Text>
        {showElectionHash && (
          <Text small>Election ID: {electionHash.substring(0, 10)}</Text>
        )}
        <Text small>
          <br /> Machine ID: {machineConfig.machineId}
        </Text>
      </Prose>
    </VerticalContainer>
  )
}

export default ElectionInfo
