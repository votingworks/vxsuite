import React, { useContext } from 'react'
import pluralize from 'pluralize'

import { Prose, Text } from '@votingworks/hmpb-ui'
import { Dictionary } from '../config/types'

import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import Table, { TD } from '../components/Table'

import NavigationScreen from '../components/NavigationScreen'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'

import find from '../utils/find'

type PrintCounts = Dictionary<Dictionary<number>>

const PrintedBallotsReportScreen = () => {
  const { electionDefinition, printedBallots, configuredAt } = useContext(
    AppContext
  )
  const { election } = electionDefinition!

  const totalBallotsPrinted = printedBallots.reduce(
    (count, ballot) => count + ballot.numCopies,
    0
  )

  const zeroCounts = election.precincts.reduce((counts, { id: precinctId }) => {
    const newCounts = { ...counts }
    newCounts[precinctId] = election.ballotStyles
      .filter((bs) => bs.precincts.includes(precinctId))
      .reduce((bsCounts, { id: ballotStyleId }) => {
        const newBsCounts = { ...bsCounts }
        newBsCounts[ballotStyleId] = 0
        return newBsCounts
      }, {} as Dictionary<number>)
    return newCounts
  }, {} as PrintCounts)

  const counts: PrintCounts = printedBallots.reduce(
    (accumulatedCounts, { precinctId, ballotStyleId, numCopies }) => {
      const newCounts = { ...accumulatedCounts }
      newCounts[precinctId]![ballotStyleId]! += numCopies
      return newCounts
    },
    zeroCounts
  )

  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(new Date())

  const reportContent = (
    <Prose maxWidth={false}>
      <h1>Printed Ballots Report</h1>
      <p>
        {electionDate}, {election.county.name}, {election.state}
        <br />
        <Text small as="span">
          This report was created on {generatedAt}.
        </Text>
        <br />
        <Text small as="span">
          Configured with the current election at{' '}
          {localeLongDateAndTime.format(new Date(configuredAt))}.
        </Text>
      </p>

      <p>
        <strong>
          {pluralize('official ballot', totalBallotsPrinted, true)}{' '}
        </strong>{' '}
        {pluralize('have', totalBallotsPrinted)} been printed.
      </p>

      <p className="no-print">
        <PrintButton primary>Print Report</PrintButton>
      </p>

      <Table>
        <tbody>
          <tr>
            <th>Precinct</th>
            <th>Ballot Style</th>
            <th>Official Ballots Printed</th>
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
                <tr key={`${precinctId}-${ballotStyleId}`}>
                  <TD>{precinct.name}</TD>
                  <TD>{ballotStyleId}</TD>
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
    <React.Fragment>
      <NavigationScreen>{reportContent}</NavigationScreen>
      <div className="print-only">{reportContent}</div>
    </React.Fragment>
  )
}

export default PrintedBallotsReportScreen
