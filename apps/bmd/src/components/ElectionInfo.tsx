import React from 'react'
import styled from 'styled-components'

import { Election, Precinct } from '../config/types'
import { getPartyPrimaryAdjectiveFromBallotStyle } from '../utils/election'

import Seal from './Seal'
import Prose from './Prose'
import Text, { NoWrap } from './Text'

const VerticalContainer = styled.div`
  display: block;
  margin: auto;
  div:first-child {
    margin: 0 auto 0.5rem;
  }
`

const CenterinBlock = styled.div`
  display: flex;
  margin: 2rem 1rem 0;
`

const HorizontalContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: auto;
  div:first-child {
    margin-right: 1rem;
    width: 125px;
  }
`

interface Props {
  precinctId: string
  ballotStyleId?: string
  election: Election
  horizontal?: boolean
}

const ElectionInfo = ({
  precinctId,
  ballotStyleId,
  election,
  horizontal = false,
}: Props) => {
  const { title: t, state, county, date, seal, sealURL } = election
  const precinct = election.precincts.find(p => p.id === precinctId) as Precinct
  const partyPrimaryAdjective = ballotStyleId
    ? getPartyPrimaryAdjectiveFromBallotStyle({
        election,
        ballotStyleId,
      })
    : ''
  const title = `${partyPrimaryAdjective} ${t}`
  if (horizontal) {
    return (
      <CenterinBlock aria-hidden="true" data-testid="election-info">
        <HorizontalContainer>
          <Seal seal={seal} sealURL={sealURL} />
          <Prose compact>
            <h5 aria-label={`${title}.`}>{title}</h5>
            <Text small>
              {date}
              <br />
              <NoWrap>{county.name},</NoWrap> <NoWrap>{state}</NoWrap>
            </Text>
            <Text small light>
              {precinct && (
                <NoWrap>
                  {precinct.name}
                  {ballotStyleId && ', '}
                </NoWrap>
              )}
              {ballotStyleId && <NoWrap>ballot style {ballotStyleId}</NoWrap>}
            </Text>
          </Prose>
        </HorizontalContainer>
      </CenterinBlock>
    )
  }
  return (
    <VerticalContainer>
      <Seal seal={seal} sealURL={sealURL} />
      <Prose textCenter>
        <h1 aria-label={`${title}.`}>{title}</h1>
        <p aria-hidden="true">
          {date}
          <br />
          {county.name}
          <br />
          {state}
        </p>
        <Text light>{precinct.name}</Text>
      </Prose>
    </VerticalContainer>
  )
}

export default ElectionInfo
