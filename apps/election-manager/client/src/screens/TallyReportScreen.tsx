import React, { useContext } from 'react'
import styled from 'styled-components'
import pluralize from 'pluralize'

import find from '../utils/find'

import { fullTallyVotes, getVotesByPrecinct } from '../lib/votecounting'

import { ElectionTally, PrecinctReportScreenProps } from '../config/types'
import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import HorizontalRule from '../components/HorizontalRule'
import Tally from '../components/Tally'
import NavigationScreen from '../components/NavigationScreen'
import Prose from '../components/Prose'
import Text from '../components/Text'
import LinkButton from '../components/LinkButton'
import { routerPaths } from '../components/ElectionManager'
import { filterTalliesByParty } from '../lib/votecounting'
import { useParams, useHistory } from 'react-router-dom'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'

const TallyHeader = styled.div`
  page-break-before: always;
  h1 + p {
    margin-top: -1.5em;
  }
`

const TallyReportScreen = () => {
  const history = useHistory()
  const { precinctId } = useParams<PrecinctReportScreenProps>()
  const { castVoteRecordFiles, election: e } = useContext(AppContext)
  const election = e!

  if (castVoteRecordFiles.castVoteRecords.length === 0) {
    history.replace(routerPaths.tally)
  }

  const votesByPrecinct = getVotesByPrecinct({
    election,
    castVoteRecords: castVoteRecordFiles.castVoteRecords,
  })

  const fullElectionTally = fullTallyVotes({ election, votesByPrecinct })

  const electionPrecinctTallies = Object.values(
    fullElectionTally.precinctTallies
  ) as ElectionTally[]

  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map((bs) => bs.partyId))
  )

  const precinctName =
    precinctId && find(election.precincts, (p) => p.id === precinctId).name

  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(new Date())

  const reportMeta = (
    <p>
      {electionDate}, {election.county.name}, {election.state}
      <br />
      <Text small as="span">
        This report was created on {generatedAt}
      </Text>
    </p>
  )

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose className="no-print">
          <h1>
            {precinctId
              ? `Precinct Tally Report for ${precinctName}`
              : `${election.title} Tally Report`}
          </h1>
          {reportMeta}
          <p>
            <Button primary onPress={window.print}>
              Print Tally Report
            </Button>
          </p>
          <p>
            <LinkButton small to={routerPaths.tally}>
              Back to Tally Index
            </LinkButton>
          </p>
        </Prose>
      </NavigationScreen>
      <div className="print-only">
        {ballotStylePartyIds.map((partyId) => {
          let precinctTallies = electionPrecinctTallies
          let overallTally = fullElectionTally.overallTally

          const party = election.parties.find((p) => p.id === partyId)
          const electionTitle = party
            ? `${party.name} ${election.title}`
            : election.title

          if (party) {
            overallTally = filterTalliesByParty({
              election,
              electionTally: fullElectionTally.overallTally,
              party,
            })
            precinctTallies = electionPrecinctTallies.map((precinctTally) =>
              filterTalliesByParty({
                election,
                electionTally: precinctTally,
                party,
              })
            )
          }

          if (precinctId) {
            precinctTallies = precinctTallies.filter(
              (pt) => pt.precinctId === precinctId
            )
          }

          return (
            <React.Fragment key={partyId || 'none'}>
              {!precinctId ? (
                <React.Fragment>
                  <TallyHeader>
                    <Prose maxWidth={false}>
                      <h1>{electionTitle} Tally Report</h1>
                      {reportMeta}
                    </Prose>
                  </TallyHeader>
                  <HorizontalRule />
                  <Tally election={election} electionTally={overallTally} />
                </React.Fragment>
              ) : (
                precinctTallies.map((precinctTally) => {
                  const precinctName = find(
                    election.precincts,
                    (p) => p.id === precinctTally.precinctId
                  ).name
                  return (
                    <React.Fragment>
                      <TallyHeader key={precinctTally.precinctId}>
                        <Prose maxWidth={false}>
                          <h1>Precinct Tally Report for: {precinctName}</h1>
                          {reportMeta}
                        </Prose>
                      </TallyHeader>
                      <HorizontalRule />
                      <Tally
                        election={election}
                        electionTally={precinctTally}
                      />
                    </React.Fragment>
                  )
                })
              )}
            </React.Fragment>
          )
        })}
      </div>
    </React.Fragment>
  )
}

export default TallyReportScreen
