import React, { useContext } from 'react'
import styled from 'styled-components'
import pluralize from 'pluralize'

import { CastVoteRecord } from '../config/types'

import NavigationScreen from '../components/NavigationScreen'
import PrintButton from '../components/PrintButton'
import LinkButton from '../components/LinkButton'
import AppContext from '../contexts/AppContext'
import routerPaths from '../routerPaths'
import {
  getOvervotePairTallies,
  getContestTallyMeta,
  ContestTallyMeta,
} from '../lib/votecounting'
import Table, { TD } from '../components/Table'
import Prose from '../components/Prose'
import Text from '../components/Text'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'
import HorizontalRule from '../components/HorizontalRule'

const ContestMeta = styled.div`
  float: right;
  margin-top: 0.5em;
`

const TallyHeader = styled.div`
  page-break-before: always;
  h1 + p {
    margin-top: -1.5em;
  }
`

const Contest = styled.div`
  margin: 1rem 0 2rem;
  page-break-inside: avoid;
  h2,
  h3 {
    margin-bottom: 0.25em;
  }
`

const PairsReportScreen = () => {
  const { castVoteRecordFiles, election: e, isOfficialResults } = useContext(
    AppContext
  )
  const election = e!
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial'
  const castVoteRecords = ([] as CastVoteRecord[]).concat(
    ...castVoteRecordFiles.castVoteRecords
  )
  const overvotePairTallies = getOvervotePairTallies({
    election,
    castVoteRecords,
  })

  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(new Date())

  const contestTallyMeta = getContestTallyMeta({
    election,
    castVoteRecords,
  })

  const reportHeader = (
    <React.Fragment>
      <h1>{statusPrefix} Overvote Combination Report</h1>
      <p>
        {electionDate}, {election.county.name}, {election.state}
        <br />
        <Text small as="span">
          This report was created on {generatedAt}
        </Text>
      </p>
      <p>
        In any given contest, if any ballot includes an overvote for more than
        two selections, the pair tallies will sum up to more than the contest
        overvote count.
      </p>
    </React.Fragment>
  )

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          {reportHeader}
          <p>
            <PrintButton primary>Print {statusPrefix} Tally Report</PrintButton>
          </p>
          <p>
            <LinkButton small to={routerPaths.tally}>
              Back to Tally Index
            </LinkButton>
          </p>
        </Prose>
      </NavigationScreen>
      <div className="print-only">
        <TallyHeader>
          <Prose maxWidth={false}>{reportHeader}</Prose>
        </TallyHeader>
        <HorizontalRule />
        {election.contests.map((contest) => {
          const tallies = overvotePairTallies[contest.id]?.tallies
          const {
            ballots,
            overvotes,
            undervotes,
          }: ContestTallyMeta = contestTallyMeta[contest.id]!
          return (
            <Contest key={contest.id}>
              <Prose maxWidth={false}>
                {!!ballots && (
                  <ContestMeta className="ignore-prose">
                    <Text as="span" small>
                      {pluralize('ballots', ballots, true)} cast /{' '}
                      {pluralize('overvotes', overvotes, true)} /{' '}
                      {pluralize('undervotes', undervotes, true)}
                    </Text>
                  </ContestMeta>
                )}
                <h3>{contest.title}</h3>
                <Table>
                  <tbody>
                    {tallies?.length ? (
                      tallies.map((tally) => (
                        <tr key={JSON.stringify(tally.candidates)}>
                          <td>
                            {tally.candidates.first.name} +{' '}
                            {tally.candidates.second.name}
                          </td>
                          <TD narrow textAlign="right">
                            {tally.tally}
                          </TD>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td>No pairs in this contest.</td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </Prose>
            </Contest>
          )
        })}
      </div>
    </React.Fragment>
  )
}

export default PairsReportScreen
