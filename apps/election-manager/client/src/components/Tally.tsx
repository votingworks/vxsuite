import React from 'react'
import styled from 'styled-components'
import {
  Election,
  Candidate,
} from '@votingworks/ballot-encoder'

import { ElectionTally } from '../config/types'

import Prose from './Prose'
import Table, { TD } from './Table'

const Contest = styled.div`
  margin: 2rem 0 4rem;
  page-break-inside: avoid;
`

interface Props {
  election: Election
  electionTally: ElectionTally
}

const Tally = ({ election, electionTally }: Props) => {
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
              <h2>
                {contest.section}, {contest.title}
              </h2>
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
export default Tally
