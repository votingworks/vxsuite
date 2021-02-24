import React, { useContext } from 'react'
import { TallyCategory, VotingMethod } from '../config/types'

import * as format from '../utils/format'
import throwIllegalValue from '../utils/throwIllegalValue'
import { getPartiesWithPrimaryElections } from '../utils/election'

import AppContext from '../contexts/AppContext'
import Loading from './Loading'
import Table, { TD } from './Table'
import LinkButton from './LinkButton'
import routerPaths from '../routerPaths'
import { getLabelForVotingMethod } from '../utils/votingMethod'

export interface Props {
  breakdownCategory: TallyCategory
}

const BallotCountsTable: React.FC<Props> = ({ breakdownCategory }) => {
  const {
    electionDefinition,
    isTabulationRunning,
    fullElectionTally,
    fullElectionExternalTally,
    externalVoteRecordsFile,
    isOfficialResults,
  } = useContext(AppContext)
  const { election } = electionDefinition!

  if (isTabulationRunning) {
    return <Loading />
  }

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial'

  const totalBallotCountInternal =
    fullElectionTally?.overallTally.numberOfBallotsCounted ?? 0
  const totalBallotCountExternal =
    fullElectionExternalTally?.overallTally.numberOfBallotsCounted ?? 0

  switch (breakdownCategory) {
    case TallyCategory.Precinct: {
      const resultsByPrecinct =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Precinct) || {}
      const externalResultsByPrecinct =
        fullElectionExternalTally?.resultsByCategory.get(
          TallyCategory.Precinct
        ) || {}
      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Precinct
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">View Tally</TD>
            </tr>
            {[...election.precincts]
              .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                  ignorePunctuation: true,
                })
              )
              .map((precinct) => {
                const precinctBallotsCount =
                  resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0
                const externalPrecinctBallotsCount =
                  externalResultsByPrecinct[precinct.id]
                    ?.numberOfBallotsCounted ?? 0
                return (
                  <tr key={precinct.id} data-testid="table-row">
                    <TD narrow nowrap>
                      {precinct.name}
                    </TD>
                    <TD>
                      {format.count(
                        precinctBallotsCount + externalPrecinctBallotsCount
                      )}
                    </TD>
                    <TD>
                      <LinkButton
                        small
                        to={routerPaths.tallyPrecinctReport({
                          precinctId: precinct.id,
                        })}
                      >
                        View {statusPrefix} {precinct.name} Tally Report
                      </LinkButton>
                    </TD>
                  </tr>
                )
              })}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong data-testid="total-ballot-count">
                  {format.count(
                    totalBallotCountInternal + totalBallotCountExternal
                  )}
                </strong>
              </TD>
              <TD>
                <LinkButton
                  small
                  to={routerPaths.tallyPrecinctReport({
                    precinctId: 'all',
                  })}
                >
                  View {statusPrefix} Tally Reports for All Precincts
                </LinkButton>
              </TD>
            </tr>
          </tbody>
        </Table>
      )
    }
    case TallyCategory.Scanner: {
      const resultsByScanner =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Scanner) || {}

      return (
        <React.Fragment>
          <Table>
            <tbody>
              <tr data-testid="table-row">
                <TD as="th" narrow>
                  Scanner ID
                </TD>
                <TD as="th">Ballot Count</TD>
                <TD as="th">View Tally</TD>
              </tr>
              {Object.keys(resultsByScanner)
                .sort((a, b) =>
                  a.localeCompare(b, 'en', {
                    numeric: true,
                    ignorePunctuation: true,
                  })
                )
                .map((scannerId) => {
                  const scannerBallotsCount =
                    resultsByScanner[scannerId]?.numberOfBallotsCounted ?? 0
                  return (
                    <tr key={scannerId} data-testid="table-row">
                      <TD narrow nowrap>
                        {scannerId}
                      </TD>
                      <TD>{format.count(scannerBallotsCount)}</TD>
                      <TD>
                        {!!scannerBallotsCount && (
                          <LinkButton
                            small
                            to={routerPaths.tallyScannerReport({
                              scannerId,
                            })}
                          >
                            View {statusPrefix} Scanner {scannerId} Tally Report
                          </LinkButton>
                        )}
                      </TD>
                    </tr>
                  )
                })}
              {externalVoteRecordsFile && (
                <tr data-testid="table-row">
                  <TD narrow nowrap>
                    External Results File ({externalVoteRecordsFile.name})
                  </TD>
                  <TD>{format.count(totalBallotCountExternal)}</TD>
                  <TD />
                </tr>
              )}
              <tr data-testid="table-row">
                <TD narrow nowrap>
                  <strong>Total Ballot Count</strong>
                </TD>
                <TD>
                  <strong>
                    {format.count(
                      totalBallotCountInternal + totalBallotCountExternal
                    )}
                  </strong>
                </TD>
                <TD />
              </tr>
            </tbody>
          </Table>
        </React.Fragment>
      )
    }
    case TallyCategory.Party: {
      const resultsByParty =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Party) || {}
      const externalResultsByParty =
        fullElectionExternalTally?.resultsByCategory.get(TallyCategory.Party) ||
        {}
      const partiesForPrimaries = getPartiesWithPrimaryElections(election)
      if (partiesForPrimaries.length === 0) {
        return null
      }

      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Party
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">View Tally</TD>
            </tr>
            {[...partiesForPrimaries]
              .sort((a, b) =>
                a.fullName.localeCompare(b.fullName, undefined, {
                  ignorePunctuation: true,
                })
              )
              .map((party) => {
                const partyBallotsCount =
                  resultsByParty[party.id]?.numberOfBallotsCounted ?? 0
                const externalPartyBallotsCount =
                  externalResultsByParty[party.id]?.numberOfBallotsCounted ?? 0
                return (
                  <tr data-testid="table-row" key={party.id}>
                    <TD narrow nowrap>
                      {party.fullName}
                    </TD>
                    <TD>
                      {format.count(
                        partyBallotsCount + externalPartyBallotsCount
                      )}
                    </TD>
                    <TD>
                      <LinkButton
                        small
                        to={routerPaths.tallyPartyReport({
                          partyId: party.id,
                        })}
                      >
                        View {statusPrefix} {party.fullName} Tally Report
                      </LinkButton>
                    </TD>
                  </tr>
                )
              })}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong data-testid="total-ballot-count">
                  {format.count(
                    totalBallotCountInternal + totalBallotCountExternal
                  )}
                </strong>
              </TD>
              <TD>
                <LinkButton small to={routerPaths.tallyFullReport}>
                  View {statusPrefix} Full Election Tally Report
                </LinkButton>
              </TD>
            </tr>
          </tbody>
        </Table>
      )
    }
    case TallyCategory.VotingMethod: {
      const resultsByVotingMethod =
        fullElectionTally?.resultsByCategory.get(TallyCategory.VotingMethod) ||
        {}
      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Voting Method
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">View Tally</TD>
            </tr>
            {Object.values(VotingMethod).map((votingMethod) => {
              const votingMethodBallotsCount =
                resultsByVotingMethod[votingMethod]?.numberOfBallotsCounted ?? 0
              if (
                votingMethod === VotingMethod.Unknown &&
                votingMethodBallotsCount === 0
              ) {
                return null
              }
              const label = getLabelForVotingMethod(votingMethod)
              return (
                <tr key={votingMethod} data-testid="table-row">
                  <TD narrow nowrap>
                    {label}
                  </TD>
                  <TD>{format.count(votingMethodBallotsCount)}</TD>
                  <TD>
                    <LinkButton
                      small
                      to={routerPaths.tallyVotingMethodReport({
                        votingMethod,
                      })}
                    >
                      View {statusPrefix} {label} Ballot Tally Report
                    </LinkButton>
                  </TD>
                </tr>
              )
            })}
            {externalVoteRecordsFile && (
              <tr data-testid="table-row">
                <TD narrow nowrap>
                  External Results File ({externalVoteRecordsFile.name})
                </TD>
                <TD>{format.count(totalBallotCountExternal)}</TD>
                <TD />
              </tr>
            )}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong>
                  {format.count(
                    totalBallotCountInternal + totalBallotCountExternal
                  )}
                </strong>
              </TD>
              <TD />
            </tr>
          </tbody>
        </Table>
      )
    }
    default:
      throwIllegalValue(breakdownCategory)
  }
}

export default BallotCountsTable
