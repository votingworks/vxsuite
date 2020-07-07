import React from 'react'
import styled from 'styled-components'
import { Election, Candidate } from '@votingworks/ballot-encoder'

import { Tally } from '../config/types'

import Prose from './Prose'
import Table, { TD } from './Table'

const Contest = styled.div`
  margin: 1rem 0 2rem;
  page-break-inside: avoid;
  h2,
  h3 {
    margin-bottom: 0.25em;
  }
`

interface Props {
  election: Election
  electionTally: Tally
}

const ContestTally = ({ election, electionTally }: Props) => {
  const { precinctId } = electionTally
  // if there is no precinctId defined, we don't need to do extra work
  // that will later be ignored, so we just use the empty array
  const ballotStyles = precinctId
    ? election.ballotStyles.filter(bs => bs.precincts.includes(precinctId))
    : []
  const districts = ballotStyles.flatMap(bs => bs.districts)

  return (
    <React.Fragment>
      {electionTally.contestTallies.map(({ contest, tallies }) => {
        const talliesRelevant = electionTally.precinctId
          ? districts.includes(contest.districtId)
          : true

        return (
          <Contest key={`div-${contest.id}`}>
            <Prose maxWidth={false}>
              <h3>
                {contest.section}, {contest.title}
              </h3>
              <Table>
                <tbody>
                  {tallies.map(tally => {
                    const key = `${contest.id}-${
                      contest.type === 'candidate'
                        ? (tally.option as Candidate).id
                        : tally.option
                    }`
                    const choice =
                      contest.type === 'candidate'
                        ? (tally.option as Candidate).name
                        : tally.option
                    return (
                      <tr key={key}>
                        <td>{choice}</td>
                        <TD narrow textAlign="right">
                          {talliesRelevant ? tally.tally : 'X'}
                        </TD>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Prose>
          </Contest>
        )
      })}
    </React.Fragment>
  )
}
export default ContestTally
