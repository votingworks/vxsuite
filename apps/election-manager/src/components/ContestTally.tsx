import React from 'react'
import styled from 'styled-components'
import {
  Election,
  Candidate,
  YesNoContest,
  CandidateContest,
} from '@votingworks/ballot-encoder'
import pluralize from 'pluralize'

import {
  ContestOption,
  Tally,
  YesNoContestOptionTally,
  YesNoOption,
} from '../config/types'

import Prose from './Prose'
import Text from './Text'
import Table, { TD } from './Table'
import { expandEitherNeitherContests } from '../utils/election'
import { getTallyForContestOption } from '../lib/votecounting'

const ContestMeta = styled.div`
  float: right;
  margin-top: 0.5em;
`

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
  precinctId?: string
}

const ContestTally: React.FC<Props> = ({
  election,
  electionTally,
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
        const { contest, tallies, metadata } = electionTally.contestTallies[
          electionContest.id
        ]!
        const talliesRelevant = precinctId
          ? districts.includes(contest.districtId)
          : true

        const { ballots, overvotes, undervotes } = metadata

        const options: readonly ContestOption[] =
          contest.type === 'candidate'
            ? (contest as CandidateContest).candidates
            : [['yes'] as YesNoOption, ['no'] as YesNoOption]

        return (
          <Contest key={`div-${contest.id}`}>
            <Prose maxWidth={false}>
              <ContestMeta className="ignore-prose">
                <Text as="span" small>
                  {pluralize('ballots', ballots, true)} cast /{' '}
                  {pluralize('overvotes', overvotes, true)} /{' '}
                  {pluralize('undervotes', undervotes, true)}
                </Text>
              </ContestMeta>
              <h3>
                {contest.section}, {contest.title}
              </h3>
              <Table>
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
