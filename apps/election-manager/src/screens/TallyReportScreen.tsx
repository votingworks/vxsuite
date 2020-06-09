import React, { useContext } from 'react'
import styled from 'styled-components'

import find from '../utils/find'

import { fullTallyVotes, getVotesByPrecinct } from '../lib/votecounting'

import { ElectionTally, PrecinctReportScreenProps } from '../config/types'
import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import HorizontalRule from '../components/HorizontalRule'
import Tally from '../components/Tally'
import NavigationScreen from '../components/NavigationScreen'
import Prose from '../components/Prose'
import LinkButton from '../components/LinkButton'
import { routerPaths } from '../components/ElectionManager'
import { filterTalliesByParty } from '../lib/votecounting'
import { useParams, useHistory } from 'react-router-dom'

const TallyHeader = styled.div`
  page-break-before: always;
`

const TallyReportScreen = () => {
  const history = useHistory()
  const { precinctId } = useParams<PrecinctReportScreenProps>()
  const {
    castVoteRecordFiles,
    election: e
  } = useContext(AppContext)
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
    new Set(election.ballotStyles.map(bs => bs.partyId))
  )

  const precinctName =
    precinctId &&
    find(election.precincts, p => p.id === precinctId).name

  const pageTitle = precinctId
    ? `Precinct Tally: ${precinctName}`
    : `Full Election Tally and ${electionPrecinctTallies.length} Precinct Tallies`

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose className="no-print">
          <h1>{pageTitle}</h1>
          <p>
            <strong>Election:</strong> {election.title}
            {precinctName && (
              <React.Fragment>
                <br />
                <span>
                  <strong>Precinct:</strong> {precinctName}
                </span>
              </React.Fragment>
            )}
          </p>

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
        {ballotStylePartyIds.map(partyId => {
          let precinctTallies = electionPrecinctTallies
          let overallTally = fullElectionTally.overallTally

          const party = election.parties.find(p => p.id === partyId)
          const electionTitle = party
            ? `${party.name} ${election.title}`
            : election.title

          if (party) {
            overallTally = filterTalliesByParty({
              election,
              electionTally: fullElectionTally.overallTally,
              party,
            })
            precinctTallies = electionPrecinctTallies.map(precinctTally =>
              filterTalliesByParty({
                election,
                electionTally: precinctTally,
                party,
              })
            )
          }

          if (precinctId) {
            precinctTallies = precinctTallies.filter(
              pt => pt.precinctId === precinctId
            )
          }

          return (
            <React.Fragment key={partyId || 'none'}>
              {!precinctId && (
                <React.Fragment>
                  <TallyHeader>
                    <Prose>
                      <h1>Election Tally</h1>
                      <p>
                        <strong>Election:</strong> {electionTitle}
                        <br />
                        <span>
                          <strong>Precinct:</strong> All Precincts
                        </span>
                      </p>
                    </Prose>
                  </TallyHeader>
                  <Tally election={election} electionTally={overallTally} />
                </React.Fragment>
              )}
              {precinctTallies.map(precinctTally => {
                const precinctName = find(
                  election.precincts,
                  p => p.id === precinctTally.precinctId
                ).name
                return (
                  <TallyHeader key={precinctTally.precinctId}>
                    <Prose>
                      <h1>Precinct Tally: {precinctName}</h1>
                      <p>
                        <strong>Election:</strong> {electionTitle}
                        <br />
                        <strong>Precinct:</strong> {precinctName}
                      </p>
                    </Prose>
                    <HorizontalRule />
                    <Tally
                      election={election}
                      electionTally={precinctTally}
                    />
                  </TallyHeader>
                )
              })}
            </React.Fragment>
          )
        })}
      </div>
    </React.Fragment>
  )
}

export default TallyReportScreen
