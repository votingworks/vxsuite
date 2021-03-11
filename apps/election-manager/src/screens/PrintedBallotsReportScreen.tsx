import React, { useContext } from 'react'
import pluralize from 'pluralize'
import _ from 'lodash'

import { Dictionary } from '@votingworks/types'
import { PrintableBallotType } from '../config/types'
import routerPaths from '../routerPaths'

import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import Prose from '../components/Prose'
import Text from '../components/Text'
import Table, { TD } from '../components/Table'

import NavigationScreen from '../components/NavigationScreen'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'

import find from '../utils/find'
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

  const zeroCountsByType = Object.values(PrintableBallotType).reduce(
    (counts, ballotType) => {
      const newCounts = { ...counts }
      newCounts[ballotType] = _.cloneDeep(zeroCounts)
      return newCounts
    },
    {} as PrintCountsByType
  )

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

      <p className="no-print">
        <PrintButton primary>Print Report</PrintButton>
      </p>
      <p className="no-print">
        <LinkButton small to={routerPaths.ballotsList}>
          Back to List Ballots
        </LinkButton>
      </p>

      <Table>
        <tbody>
          <tr>
            <TD as="th" narrow nowrap>
              Precinct
            </TD>
            <TD as="th" narrow nowrap>
              Ballot Style
            </TD>
            <TD as="th" narrow nowrap>
              Official Absentee Ballots Printed
            </TD>
            <TD as="th" narrow nowrap>
              Official Precinct Ballots Printed
            </TD>
            <TD as="th">Total Official Ballots Printed</TD>
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
    <React.Fragment>
      <NavigationScreen>{reportContent}</NavigationScreen>
      <div className="print-only">
        <LogoMark />
        {reportContent}
      </div>
    </React.Fragment>
  )
}

export default PrintedBallotsReportScreen
