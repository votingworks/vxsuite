import React from 'react'
import styled from 'styled-components'
import { Precinct, Election, MsEitherNeitherContest } from '@votingworks/types'
import {
  Tally,
  CandidateVoteTally,
  YesNoVoteTally,
  MsEitherNeitherTally,
  TallySourceMachineType,
} from '@votingworks/utils'

import numberWithCommas from '../utils/numberWithCommas'

import Table, { TD } from './Table'
import Prose from './Prose'
import { NoWrap } from './Text'

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
  tally: Tally
  precinctId: string
  reportPurpose: string
}

const PrecinctTallyReport: React.FC<Props> = ({
  ballotCount,
  sourceMachineType,
  currentDateTime,
  election,
  isPollsOpen,
  tally,
  precinctId,
  reportPurpose,
}) => {
  const { contests, precincts } = election
  const precinct = precincts.find((p) => p.id === precinctId) as Precinct
  const ballotAction =
    sourceMachineType === TallySourceMachineType.BMD ? 'printed' : 'scanned'

  return (
    <Report>
      <h1>
        <NoWrap>{precinct.name}</NoWrap> <NoWrap>{election.title}</NoWrap>{' '}
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
        const candidateContest = contest.type === 'candidate' && contest
        const yesnoContest = contest.type === 'yesno' && contest
        const eitherNeitherContest =
          contest.type === 'ms-either-neither' && contest
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
                        <td>
                          {
                            (contest as MsEitherNeitherContest).eitherOption
                              .label
                          }
                        </td>
                        <TD narrow textAlign="right">
                          numberWithCommas( (tally[contestIndex] as
                          MsEitherNeitherTally) .eitherOption )
                        </TD>
                      </tr>
                      <tr>
                        <td>
                          {
                            (contest as MsEitherNeitherContest).neitherOption
                              .label
                          }
                        </td>
                        <TD narrow textAlign="right">
                          {numberWithCommas(
                            (tally[contestIndex] as MsEitherNeitherTally)
                              .neitherOption
                          )}
                        </TD>
                      </tr>
                      <tr>
                        <td>
                          {
                            (contest as MsEitherNeitherContest).firstOption
                              .label
                          }
                        </td>
                        <TD narrow textAlign="right">
                          {numberWithCommas(
                            (tally[contestIndex] as MsEitherNeitherTally)
                              .firstOption
                          )}
                        </TD>
                      </tr>
                      <tr>
                        <td>
                          {
                            (contest as MsEitherNeitherContest).secondOption
                              .label
                          }
                        </td>
                        <TD narrow textAlign="right">
                          {numberWithCommas(
                            (tally[contestIndex] as MsEitherNeitherTally)
                              .secondOption
                          )}
                        </TD>
                      </tr>
                    </React.Fragment>
                  )}
                  {candidateContest &&
                    candidateContest.candidates.map(
                      (candidate, candidateIndex) => (
                        <tr key={candidate.id}>
                          <td>{candidate.name}</td>
                          <TD narrow textAlign="right">
                            {numberWithCommas(
                              (tally[contestIndex] as CandidateVoteTally)
                                .candidates[candidateIndex]
                            )}
                          </TD>
                        </tr>
                      )
                    )}
                  {yesnoContest && (
                    <React.Fragment>
                      <tr>
                        <td>Yes</td>
                        <TD narrow textAlign="right">
                          {numberWithCommas(
                            (tally[contestIndex] as YesNoVoteTally).yes
                          )}
                        </TD>
                      </tr>
                      <tr>
                        <td>No</td>
                        <TD narrow textAlign="right">
                          {numberWithCommas(
                            (tally[contestIndex] as YesNoVoteTally).no
                          )}
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
