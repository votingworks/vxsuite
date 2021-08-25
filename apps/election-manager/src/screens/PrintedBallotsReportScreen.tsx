import React, { useContext } from 'react'
import pluralize from 'pluralize'
import _ from 'lodash'

import { Dictionary } from '@votingworks/types'
import { format, find } from '@votingworks/utils'
import { PrintableBallotType } from '../config/types'
import routerPaths from '../routerPaths'

import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import Prose from '../components/Prose'
import Text from '../components/Text'
import Table, { TD } from '../components/Table'

import NavigationScreen from '../components/NavigationScreen'

import LogoMark from '../components/LogoMark'
import LinkButton from '../components/LinkButton'

type PrintCounts = Dictionary<Dictionary<number>>
type PrintCountsByType = Dictionary<Dictionary<Dictionary<number>>>

const PrintedBallotsReportScreen: React.FC = () => {
  const { electionDefinition, printedBallots, configuredAt } = useContext(
    AppContext
  )
  const { election } = electionDefinition!

  const totalBallotsPrinted = printedBallots.reduce(
    (count, ballot) => count + ballot.numCopies,
    0
  )

  const totalAbsenteeBallotsPrinted = printedBallots
    .filter((ballot) => ballot.type === PrintableBallotType.Absentee)
    .reduce((count, ballot) => count + ballot.numCopies, 0)

  const totalPrecinctBallotsPrinted = printedBallots
    .filter((ballot) => ballot.type === PrintableBallotType.Precinct)
    .reduce((count, ballot) => count + ballot.numCopies, 0)

  const zeroCounts = election.precincts.reduce<PrintCounts>(
    (counts, { id: precinctId }) => {
      const newCounts = { ...counts }
      newCounts[precinctId] = election.ballotStyles
        .filter((bs) => bs.precincts.includes(precinctId))
        .reduce<Dictionary<number>>((bsCounts, { id: ballotStyleId }) => {
        const newBsCounts = { ...bsCounts }
        newBsCounts[ballotStyleId] = 0
        return newBsCounts
      }, {})
      return newCounts
    },
    {}
  )

  const zeroCountsByType = Object.values(
    PrintableBallotType
  ).reduce<PrintCountsByType>((counts, ballotType) => {
    const newCounts = { ...counts }
    newCounts[ballotType] = _.cloneDeep(zeroCounts)
    return newCounts
  }, {})

  const counts: PrintCounts = printedBallots.reduce(
    (accumulatedCounts, { precinctId, ballotStyleId, numCopies }) => {
      const newCounts = { ...accumulatedCounts }
      newCounts[precinctId]![ballotStyleId]! += numCopies
      return newCounts
    },
    zeroCounts
  )

  const countsByType: PrintCountsByType = printedBallots.reduce(
    (accumulatedCounts, { precinctId, ballotStyleId, numCopies, type }) => {
      const newCounts = { ...accumulatedCounts }
      newCounts[type]![precinctId]![ballotStyleId]! += numCopies
      return newCounts
    },
    zeroCountsByType
  )

  const electionDate = format.localeWeekdayAndDate(new Date(election.date))
  const generatedAt = format.localeLongDateAndTime(new Date())

  const reportContent = (
    <Prose maxWidth={false}>
      <h1>Printed Ballots Report</h1>
      <p>
        {electionDate}, {election.county.name}, {election.state}
        <br />
        <Text small as='span'>
          This report was created on {generatedAt}.
        </Text>
        <br />
        <Text small as='span'>
          Configured with the current election at{' '}
          {format.localeLongDateAndTime(new Date(configuredAt))}.
        </Text>
      </p>
      <p>
        {pluralize('absentee ballot', totalAbsenteeBallotsPrinted, true)} and{' '}
        {pluralize('precinct ballot', totalPrecinctBallotsPrinted, true)}{' '}
        {pluralize('have', totalBallotsPrinted)} been printed.
      </p>
      <p>
        <strong>
          {pluralize('official ballot', totalBallotsPrinted, true)}{' '}
        </strong>{' '}
        {pluralize('have', totalBallotsPrinted)} been printed.
      </p>

      <p className='no-print'>
        <PrintButton primary sides='one-sided'>
          Print Report
        </PrintButton>
      </p>
      <p className='no-print'>
        <LinkButton small to={routerPaths.ballotsList}>
          Back to List Ballots
        </LinkButton>
      </p>

      <Table>
        <tbody>
          <tr>
            <TD as='th' narrow nowrap>
              Precinct
            </TD>
            <TD as='th' narrow nowrap>
              Ballot Style
            </TD>
            <TD as='th' narrow nowrap>
              Official Absentee Ballots Printed
            </TD>
            <TD as='th' narrow nowrap>
              Official Precinct Ballots Printed
            </TD>
            <TD as='th'>Total Official Ballots Printed</TD>
          </tr>
          {Object.keys(counts).flatMap((precinctId) => {
            const precinct = find(
              election.precincts,
              (p) => p.id === precinctId
            )
            if (!precinct) {
              return null
            }
            return Object.keys(counts[precinctId]!).map((ballotStyleId) => {
              return (
                <tr
                  key={`${precinctId}-${ballotStyleId}`}
                  data-testid={`row-${precinctId}-${ballotStyleId}`}
                >
                  <TD nowrap>{precinct.name}</TD>
                  <TD>{ballotStyleId}</TD>
                  <TD>
                    {
                      countsByType[PrintableBallotType.Absentee]![precinctId]![
                        ballotStyleId
                      ]!
                    }
                  </TD>
                  <TD>
                    {
                      countsByType[PrintableBallotType.Precinct]![precinctId]![
                        ballotStyleId
                      ]!
                    }
                  </TD>
                  <TD>{counts[precinctId]![ballotStyleId]!}</TD>
                </tr>
              )
            })
          })}
        </tbody>
      </Table>
    </Prose>
  )
  return (
    <>
      <NavigationScreen>{reportContent}</NavigationScreen>
      <div className='print-only'>
        <LogoMark />
        {reportContent}
      </div>
    </>
  )
}

export default PrintedBallotsReportScreen
