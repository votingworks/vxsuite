import React from 'react'
import styled from 'styled-components'
import pluralize from 'pluralize'
import { strict as assert } from 'assert'

import {
  Election,
  expandEitherNeitherContests,
  ExternalTally,
  Tally,
} from '@votingworks/types'
import {
  getContestVoteOptionsForCandidateContest,
  getContestVoteOptionsForYesNoContest,
  combineContestTallies,
  throwIllegalValue,
} from '@votingworks/utils'

import { Table, TD } from './Table'
import { Prose } from './Prose'
import { Text, NoWrap } from './Text'

interface ContestProps {
  dim?: boolean
}

const Contest = styled.div<ContestProps>`
  margin: 1rem 0;
  color: ${({ dim }) => (dim ? '#cccccc' : undefined)};
  page-break-inside: avoid;
  p:first-child {
    margin-bottom: 0;
  }
  h3 {
    margin-top: 0;
    margin-bottom: 0.5em;
    & + p {
      margin-top: -0.8em;
      margin-bottom: 0.25em;
    }
    & + table {
      margin-top: -0.5em;
    }
  }
`

interface Props {
  election: Election
  electionTally: Tally
  externalTallies: ExternalTally[]
  precinctId?: string
}

export const ContestTally = ({
  election,
  electionTally,
  externalTallies,
  precinctId,
}: Props): JSX.Element => {
  // if there is no precinctId defined, we don't need to do extra work
  // that will later be ignored, so we just use the empty array
  const ballotStyles = precinctId
    ? election.ballotStyles.filter((bs) => bs.precincts.includes(precinctId))
    : []
  const districts = ballotStyles.flatMap((bs) => bs.districts)

  return (
    <React.Fragment>
      {expandEitherNeitherContests(election.contests).map((contest) => {
        if (!(contest.id in electionTally.contestTallies)) {
          return null
        }
        const externalTalliesContest = externalTallies.map(
          (t) => t.contestTallies[contest.id]
        )
        const primaryContestTally = electionTally.contestTallies[contest.id]
        assert(primaryContestTally)

        let finalContestTally = primaryContestTally
        for (const externalTally of externalTalliesContest) {
          if (externalTally !== undefined) {
            finalContestTally = combineContestTallies(
              finalContestTally,
              externalTally
            )
          }
        }

        const { tallies, metadata } = finalContestTally

        const talliesRelevant = precinctId
          ? districts.includes(contest.districtId)
          : true

        const { ballots, overvotes, undervotes } = metadata

        const contestOptionTableRows: JSX.Element[] = []
        switch (contest.type) {
          case 'candidate': {
            const candidates = getContestVoteOptionsForCandidateContest(contest)
            for (const candidate of candidates) {
              const key = `${contest.id}-${candidate.id}`
              const tally = tallies[candidate.id]
              contestOptionTableRows.push(
                <tr key={key} data-testid={key}>
                  <td>{candidate.name}</td>
                  <TD narrow textAlign="right">
                    {talliesRelevant && (tally?.tally ?? 'X')}
                  </TD>
                </tr>
              )
            }
            break
          }
          case 'yesno': {
            const voteOptions = getContestVoteOptionsForYesNoContest(contest)
            for (const option of voteOptions) {
              const key = `${contest.id}-${option}`
              const tally = tallies[option]
              const choiceName = option === 'yes' ? 'Yes' : 'No'
              contestOptionTableRows.push(
                <tr key={key} data-testid={key}>
                  <td>{choiceName}</td>
                  <TD narrow textAlign="right">
                    {talliesRelevant && (tally?.tally ?? 'X')}
                  </TD>
                </tr>
              )
            }
            break
          }
          default:
            throwIllegalValue(contest, 'type')
        }

        return (
          <Contest key={`div-${contest.id}`} dim={!talliesRelevant}>
            <Prose maxWidth={false} data-testid={`results-table-${contest.id}`}>
              <Text small>{contest.section}</Text>
              <h3>{contest.title}</h3>
              <Text small>
                <NoWrap>{pluralize('ballots', ballots, true)} cast /</NoWrap>{' '}
                <NoWrap>{pluralize('overvotes', overvotes, true)} /</NoWrap>{' '}
                <NoWrap>{pluralize('undervotes', undervotes, true)}</NoWrap>
              </Text>
              <Table borderTop condensed>
                <tbody>{contestOptionTableRows}</tbody>
              </Table>
            </Prose>
          </Contest>
        )
      })}
    </React.Fragment>
  )
}
