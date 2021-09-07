import React from 'react'
import styled from 'styled-components'
import { Election } from '@votingworks/types'
import {
  find,
  SerializedTally,
  SerializedCandidateVoteTally,
  SerializedYesNoVoteTally,
  SerializedMsEitherNeitherTally,
  TallySourceMachineType,
} from '@votingworks/utils'

import numberWithCommas from '../utils/numberWithCommas'

import Table, { TD } from './Table'
import Prose from './Prose'
import { NoWrap } from './Text'
import { PrecinctSelection, PrecinctSelectionKind } from '../config/types'

const Report = styled.div`
  margin: 0;
  page-break-after: always;
  @media screen {
    display: none;
  }
`

const Contest = styled.div`
  margin: 2rem 0 4rem;
  page-break-inside: avoid;
`

interface Props {
  ballotCount: number
  sourceMachineType: TallySourceMachineType
  currentDateTime: string
  election: Election
  isPollsOpen: boolean
  tally: SerializedTally
  precinctSelection: PrecinctSelection
  reportPurpose: string
}

const PrecinctTallyReport = ({
  ballotCount,
  sourceMachineType,
  currentDateTime,
  election,
  isPollsOpen,
  tally,
  precinctSelection,
  reportPurpose,
}: Props): JSX.Element => {
  const { ballotStyles, contests, precincts } = election
  const precinctName =
    precinctSelection.kind === PrecinctSelectionKind.AllPrecincts
      ? 'All Precincts'
      : find(precincts, (p) => p.id === precinctSelection.precinctId).name
  const ballotAction =
    sourceMachineType === TallySourceMachineType.BMD ? 'printed' : 'scanned'

  const precinctBallotStyles =
    precinctSelection.kind === PrecinctSelectionKind.AllPrecincts
      ? ballotStyles
      : ballotStyles.filter((bs) =>
          bs.precincts.includes(precinctSelection.precinctId)
        )
  const precinctContestIds = contests
    .filter((c) =>
      precinctBallotStyles.find(
        (bs) => bs.partyId === c.partyId && bs.districts.includes(c.districtId)
      )
    )
    .map((c) => c.id)
  return (
    <Report>
      <h1>
        <NoWrap>{precinctName}</NoWrap> <NoWrap>{election.title}</NoWrap>{' '}
        <NoWrap>Tally Report</NoWrap>
      </h1>
      <p>
        This report should be <strong>{reportPurpose}</strong>.
      </p>
      <p>
        {isPollsOpen ? 'Polls Closed' : 'Polls Opened'} and report{' '}
        {ballotAction} at: <strong>{currentDateTime}</strong>
      </p>
      <p>
        Ballots {ballotAction} count: <strong>{ballotCount}</strong>
      </p>
      {contests.map((contest, contestIndex) => {
        const isContestInPrecinct = precinctContestIds.includes(contest.id)
        const candidateContest =
          contest.type === 'candidate' ? contest : undefined
        const yesnoContest = contest.type === 'yesno' ? contest : undefined
        const eitherNeitherContest =
          contest.type === 'ms-either-neither' ? contest : undefined
        return (
          <Contest key={contest.id}>
            <Prose>
              <h2>
                {contest.section}, {contest.title}
              </h2>
              <Table>
                <tbody>
                  {eitherNeitherContest && (
                    <React.Fragment>
                      <tr>
                        <td>{eitherNeitherContest.eitherOption.label}</td>
                        <TD narrow textAlign="right">
                          {isContestInPrecinct
                            ? numberWithCommas(
                                (tally[
                                  contestIndex
                                ] as SerializedMsEitherNeitherTally)
                                  .eitherOption
                              )
                            : /* istanbul ignore next */
                              'X'}
                        </TD>
                      </tr>
                      <tr>
                        <td>{eitherNeitherContest.neitherOption.label}</td>
                        <TD narrow textAlign="right">
                          {
                            /* istanbul ignore else */ isContestInPrecinct
                              ? numberWithCommas(
                                  (tally[
                                    contestIndex
                                  ] as SerializedMsEitherNeitherTally)
                                    .neitherOption
                                )
                              : /* istanbul ignore next */
                                'X'
                          }
                        </TD>
                      </tr>
                      <tr>
                        <td>{eitherNeitherContest.firstOption.label}</td>
                        <TD narrow textAlign="right">
                          {isContestInPrecinct
                            ? numberWithCommas(
                                (tally[
                                  contestIndex
                                ] as SerializedMsEitherNeitherTally).firstOption
                              )
                            : /* istanbul ignore next */
                              'X'}
                        </TD>
                      </tr>
                      <tr>
                        <td>{eitherNeitherContest.secondOption.label}</td>
                        <TD narrow textAlign="right">
                          {isContestInPrecinct
                            ? numberWithCommas(
                                (tally[
                                  contestIndex
                                ] as SerializedMsEitherNeitherTally)
                                  .secondOption
                              )
                            : /* istanbul ignore next */
                              'X'}
                        </TD>
                      </tr>
                    </React.Fragment>
                  )}
                  {candidateContest?.candidates.map(
                    (candidate, candidateIndex) => (
                      <tr key={candidate.id}>
                        <td>{candidate.name}</td>
                        <TD narrow textAlign="right">
                          {isContestInPrecinct
                            ? numberWithCommas(
                                (tally[
                                  contestIndex
                                ] as SerializedCandidateVoteTally).candidates[
                                  candidateIndex
                                ]
                              )
                            : 'X'}
                        </TD>
                      </tr>
                    )
                  )}
                  {yesnoContest && (
                    <React.Fragment>
                      <tr>
                        <td>Yes</td>
                        <TD narrow textAlign="right">
                          {isContestInPrecinct
                            ? numberWithCommas(
                                (tally[
                                  contestIndex
                                ] as SerializedYesNoVoteTally).yes
                              )
                            : 'X'}
                        </TD>
                      </tr>
                      <tr>
                        <td>No</td>
                        <TD narrow textAlign="right">
                          {isContestInPrecinct
                            ? numberWithCommas(
                                (tally[
                                  contestIndex
                                ] as SerializedYesNoVoteTally).no
                              )
                            : 'X'}
                        </TD>
                      </tr>
                    </React.Fragment>
                  )}
                </tbody>
              </Table>
            </Prose>
          </Contest>
        )
      })}
    </Report>
  )
}

export default PrecinctTallyReport
