import React, { useContext, useState } from 'react'
import styled from 'styled-components'
import { Election } from '@votingworks/ballot-encoder'
import ObjectHash from 'object-hash'
import dashify from 'dashify'

import AppContext from '../contexts/AppContext'

import { routerPaths } from '../components/ElectionManager'
import Button, { SegmentedButton } from '../components/Button'
import LinkButton from '../components/LinkButton'
import { MainChild } from '../components/Main'
import Table, { TD } from '../components/Table'
import { Monospace, NoWrap } from '../components/Text'
import Prose from '../components/Prose'
import pluralize from 'pluralize'

interface BallotStyleData {
  ballotStyleId: string
  contestIds: string[]
  precinctIds: string[]
}

interface BallotStyleDataRow {
  ballotStyleId: string
  contestIds: string[]
  precinctId: string
}

const Header = styled.div`
  margin-bottom: 1rem;
`

const sortOptions = {
  ignorePunctuation: true,
  numeric: true,
}

const BallotListScreen = () => {
  const { election: e } = useContext(AppContext)
  const election = e as Election
  const { ballotStyles } = election

  const ballotStylesData: BallotStyleData[] = ballotStyles
    .map((ballotStyle) => ({
      ballotStyleId: ballotStyle.id,
      precinctIds: ballotStyle.precincts,
      contestIds: election.contests
        .filter((c) => ballotStyle.districts.includes(c.districtId))
        .map((c) => c.id),
    }))
    .sort((a, b) =>
      a.ballotStyleId.localeCompare(b.ballotStyleId, undefined, sortOptions)
    )

  const ballotStylesDataByStyle = ballotStylesData.reduce<BallotStyleDataRow[]>(
    (accumulator, currentValue) =>
      accumulator.concat(
        currentValue.precinctIds.map((precinctId) => ({
          ...currentValue,
          precinctId,
        }))
      ),
    []
  )

  const ballotStylesDataByPrecinct = [...ballotStylesDataByStyle].sort(
    (a, b) => {
      const nameA = election.precincts.find((p) => p.id === a.precinctId)!.name
      const nameB = election.precincts.find((p) => p.id === b.precinctId)!.name
      return nameA.localeCompare(nameB, undefined, sortOptions)
    }
  )

  const ballotLists = [ballotStylesDataByStyle, ballotStylesDataByPrecinct]
  const [ballotView, setBallotView] = useState(0)
  const sortByStyle = () => setBallotView(0)
  const sortByPrecinct = () => setBallotView(1)

  const electionHash = ObjectHash(election)
  const ballots = ballotLists[ballotView]
  return (
    <MainChild>
      <Header>
        <Prose maxWidth={false}>
          <h1>Ballots</h1>
          <p>
            {`Sort ${pluralize('ballot', ballots.length, true)} by: `}
            <SegmentedButton>
              <Button small onPress={sortByStyle} disabled={ballotView === 0}>
                Style
              </Button>
              <Button
                small
                onPress={sortByPrecinct}
                disabled={ballotView === 1}
              >
                Precinct
              </Button>
            </SegmentedButton>{' '}
            <LinkButton small to={routerPaths.export}>
              Export Ballot Package
            </LinkButton>
          </p>
        </Prose>
      </Header>
      <Table>
        <thead>
          <tr>
            <TD as="th" />
            <TD as="th">Style</TD>
            <TD as="th">Precinct</TD>
            <TD as="th">Contests</TD>
            <TD as="th">Filename</TD>
          </tr>
        </thead>
        <tbody>
          {ballots.map((ballot) => {
            const precinctName = election.precincts.find(
              (p) => p.id === ballot.precinctId
            )!.name
            return (
              <tr key={ballot.ballotStyleId + ballot.precinctId}>
                <TD textAlign="right" nowrap>
                  <LinkButton
                    fullWidth
                    small
                    to={routerPaths.ballotsView(ballot)}
                  >
                    View Ballot
                  </LinkButton>
                </TD>
                <TD>{ballot.ballotStyleId}</TD>
                <TD>
                  <NoWrap>{precinctName}</NoWrap>
                </TD>
                <TD>{ballot.contestIds.length}</TD>
                <TD nowrap>
                  <Monospace>
                    {`election-${electionHash}-ballot-style-${
                      ballot.ballotStyleId
                    }-precinct-${dashify(precinctName)}.pdf`}
                  </Monospace>
                </TD>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </MainChild>
  )
}

export default BallotListScreen
