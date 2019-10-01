import React from 'react'
import styled from 'styled-components'
import { Election, Tally, Precinct } from '../config/types'

import Table, { TD } from './Table'
import Prose from './Prose'
import { NoWrap } from './Text'

const Contest = styled.div`
  margin: 2rem 0 4rem;
  page-break-inside: avoid;
`

interface Props {
  ballotsPrintedCount: number
  currentDateTime: string
  election: Election
  isPollsOpen: boolean
  tally: Tally
  precinctId: string
  reportPurpose: string
}

const PrecinctTallyReport = ({
  ballotsPrintedCount,
  currentDateTime,
  election,
  isPollsOpen,
  tally,
  precinctId,
  reportPurpose,
}: Props) => {
  const { ballotStyles, contests, precincts } = election
  const precinct = precincts.find(p => p.id === precinctId) as Precinct

  const precinctDistrictIds = ballotStyles
    .filter(bs => bs.precincts.includes(precinctId))
    .map(bs => bs.districts)
    .flat()
    .filter((x, i, a) => a.indexOf(x) === i) // unique filter
  const precinctContestIds = contests
    .filter(c => precinctDistrictIds.includes(c.districtId))
    .map(c => c.id)
  return (
    <div>
      <h1>
        <NoWrap>{precinct.name}</NoWrap> <NoWrap>{election.title}</NoWrap>{' '}
        <NoWrap>Tally Report</NoWrap>
      </h1>
      <p>
        This report should be <strong>{reportPurpose}</strong>.
      </p>
      <p>
        {isPollsOpen ? 'Polls Closed' : 'Polls Opened'} and report printed at:{' '}
        <strong>{currentDateTime}</strong>
      </p>
      <p>
        Ballots printed count: <strong>{ballotsPrintedCount}</strong>
      </p>
      {contests.map((contest, contestIndex) => {
        const isContestInPrecinct = precinctContestIds.includes(contest.id)
        const candidateContest = contest.type === 'candidate' && contest
        const yesnoContest = contest.type === 'yesno' && contest
        return (
          <Contest key={contest.id}>
            <Prose>
              <h2>
                {contest.section}, {contest.title}
              </h2>
              <Table>
                <tbody>
                  {candidateContest &&
                    candidateContest.candidates.map(
                      (candidate, candidateIndex) => (
                        <tr key={candidate.id}>
                          <td>{candidate.name}</td>
                          <TD narrow textAlign="right">
                            {isContestInPrecinct
                              ? tally[contestIndex][candidateIndex]
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
                          {isContestInPrecinct ? tally[contestIndex][0] : 'X'}
                        </TD>
                      </tr>
                      <tr>
                        <td>No</td>
                        <TD narrow textAlign="right">
                          {isContestInPrecinct ? tally[contestIndex][1] : 'X'}
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
    </div>
  )
}

export default PrecinctTallyReport
