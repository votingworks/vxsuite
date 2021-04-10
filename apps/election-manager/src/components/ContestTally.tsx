import React from 'react'
import styled from 'styled-components'
import {
  Election,
  Candidate,
  YesNoContest,
  AnyContest,
} from '@votingworks/types'
import pluralize from 'pluralize'

import { ExternalTally, Tally, YesNoContestOptionTally } from '../config/types'

import Prose from './Prose'
import Text, { NoWrap } from './Text'
import Table, { TD } from './Table'
import {
  expandEitherNeitherContests,
  getContestOptionsForContest,
} from '../utils/election'
import { getTallyForContestOption } from '../lib/votecounting'
import { combineContestTallies } from '../utils/semsTallies'

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

const ContestTally: React.FC<Props> = ({
  election,
  electionTally,
  externalTallies,
  precinctId,
}) => {
  // if there is no precinctId defined, we don't need to do extra work
  // that will later be ignored, so we just use the empty array
  const ballotStyles = precinctId
    ? election.ballotStyles.filter((bs) => bs.precincts.includes(precinctId))
    : []
  const districts = ballotStyles.flatMap((bs) => bs.districts)

  return (
    <React.Fragment>
      {expandEitherNeitherContests(election.contests).map((electionContest) => {
        if (!(electionContest.id in electionTally.contestTallies)) {
          return null
        }
        const externalTalliesContest = externalTallies.map(
          (t) => t.contestTallies[electionContest.id]
        )
        const primaryContestTally = electionTally.contestTallies[
          electionContest.id
        ]!

        let finalContestTally = primaryContestTally
        externalTalliesContest.forEach((externalTally) => {
          if (externalTally !== undefined) {
            finalContestTally = combineContestTallies(
              finalContestTally,
              externalTally
            )
          }
        })

        const { contest, tallies, metadata } = finalContestTally

        const talliesRelevant = precinctId
          ? districts.includes(contest.districtId)
          : true

        const { ballots, overvotes, undervotes } = metadata
        const options = getContestOptionsForContest(contest as AnyContest)

        return (
          <Contest key={`div-${contest.id}`} dim={!talliesRelevant}>
            <Prose maxWidth={false}>
              <Text small>{contest.section}</Text>
              <h3>{contest.title}</h3>
              <Text small>
                <NoWrap>{pluralize('ballots', ballots, true)} cast /</NoWrap>{' '}
                <NoWrap>{pluralize('overvotes', overvotes, true)} /</NoWrap>{' '}
                <NoWrap>{pluralize('undervotes', undervotes, true)}</NoWrap>
              </Text>
              <Table borderTop condensed>
                <tbody>
                  {options.map((option) => {
                    const tally = getTallyForContestOption(
                      option,
                      tallies,
                      contest
                    )

                    const key = `${contest.id}-${
                      contest.type === 'candidate'
                        ? (tally.option as Candidate).id
                        : tally.option
                    }`

                    const choice =
                      contest.type === 'candidate'
                        ? (tally.option as Candidate).name
                        : (tally as YesNoContestOptionTally).option[0] === 'yes'
                        ? (contest as YesNoContest).yesOption?.label || 'Yes'
                        : (contest as YesNoContest).noOption?.label || 'No'
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
