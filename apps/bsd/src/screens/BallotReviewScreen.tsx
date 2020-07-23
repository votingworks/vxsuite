import React, { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useParams, useHistory } from 'react-router-dom'
import pluralize from 'pluralize'

import { fetchBallotInfo, fetchNextBallotToReview } from '../api/hmpb'
import ContestOptionButton from '../components/ContestOptionButton'
import ContestOptionCheckbox from '../components/ContestOptionCheckbox'
import Prose from '../components/Prose'
import {
  Contest,
  ContestOption,
  DeepReadonly,
  MarkStatus,
  ReviewMarginalMarksBallot,
  AdjudicationStatus,
} from '../config/types'
import fetchJSON from '../util/fetchJSON'
import { scaler } from '../util/scale'
import * as workflow from '../workflows/BallotReviewScreenWorkflow'
import Main, { MainChild } from '../components/Main'
import ButtonBar from '../components/ButtonBar'
import Brand from '../components/Brand'
import Button from '../components/Button'
import LinkButton from '../components/LinkButton'
import Text from '../components/Text'

const BallotReviewColumns = styled.div`
  display: flex;
  flex-direction: row;
  > div:first-child {
    position: relative;
    margin-right: 1em;
  }
  > div:last-child {
    min-width: 400px;
  }
`

export interface Props {
  isTestMode: boolean
  adjudicationStatus: AdjudicationStatus
}

export default function BallotReviewScreen({
  isTestMode,
  adjudicationStatus,
}: Props) {
  const history = useHistory()
  const { ballotId } = useParams<{
    ballotId?: string
  }>()
  const [state, setState] = useState<workflow.State>(workflow.init())
  const ballot =
    state.type === 'init' ||
    state.type === 'failed' ||
    state.type === 'no-ballots'
      ? undefined
      : state.ballot

  if (state.type === 'no-ballots') {
    history.push('/')
  }

  useEffect(() => {
    if (state.type === 'init') {
      ;(async () => {
        try {
          const ballotInfo = ballotId
            ? await fetchBallotInfo(ballotId)
            : await fetchNextBallotToReview()

          if (!ballotInfo) {
            setState(workflow.noBallots(state))
          } else {
            setState(workflow.fetchedBallotInfo(state, ballotInfo))
          }
        } catch (error) {
          setState(workflow.fail(state, error))
        }
      })()
    }
  }, [ballotId, state, setState])

  const scale = scaler(ballot ? 800 / ballot.ballot.image.width : 1)

  const onContestOptionClick = useCallback<
    React.MouseEventHandler<HTMLElement>
  >(
    (event) => {
      if (state.type !== 'review') {
        return
      }

      const { contestId, contestOptionId } = event.currentTarget.dataset
      const contest = state.ballot.contests.find(({ id }) => id === contestId)
      const contestOption = contest?.options.find(
        ({ id }) => id === contestOptionId
      )

      if (contest && contestOption) {
        setState(workflow.toggle(state, contest, contestOption))
      }
    },
    [state]
  )

  const getContestOptionDecoration = useCallback(
    (
      contest: DeepReadonly<Contest>,
      option: DeepReadonly<ContestOption>
    ): { current: MarkStatus; changed?: MarkStatus } => {
      if (state.type === 'review' || state.type === 'done') {
        const current =
          (state.ballot as ReviewMarginalMarksBallot).marks?.[contest.id]?.[
            option.id
          ] ?? MarkStatus.Unmarked
        const changed = state.changes[contest.id]?.[option.id]
        return { current, changed }
      }

      return { current: MarkStatus.Unmarked }
    },
    [state]
  )

  const onSaveClick = useCallback(() => {
    if (state.type !== 'review') {
      return
    }

    ;(async () => {
      try {
        await fetchJSON(state.ballot.ballot.url, {
          method: 'PATCH',
          body: JSON.stringify(state.changes),
          headers: {
            'Content-Type': 'application/json',
          },
        })

        setState(workflow.init())
      } catch (error) {
        setState(workflow.fail(error))
      }
    })()
  }, [state])

  if (state.type === 'failed') {
    return (
      <React.Fragment>
        <Main>
          <MainChild maxWidth={false}>
            <Prose maxWidth={false}>
              <p>{state.error?.message ?? 'An error occurred'}</p>
            </Prose>
          </MainChild>
        </Main>
        <ButtonBar secondary naturalOrder separatePrimaryButton>
          <Brand>
            VxScan
            {isTestMode && (
              <React.Fragment>&nbsp;TEST&nbsp;MODE</React.Fragment>
            )}
          </Brand>
          <LinkButton small to="/" primary disabled>
            Dashboard
          </LinkButton>
        </ButtonBar>
      </React.Fragment>
    )
  }

  if (state.type === 'init' || !ballot) {
    return (
      <React.Fragment>
        <Main>
          <MainChild maxWidth={false}>
            <Prose maxWidth={false}>
              <p>Loading the next ballot requiring adjudication…</p>
            </Prose>
          </MainChild>
        </Main>
        <ButtonBar secondary naturalOrder separatePrimaryButton>
          <Brand>
            VxScan
            {isTestMode && (
              <React.Fragment>&nbsp;TEST&nbsp;MODE</React.Fragment>
            )}
          </Brand>
          <LinkButton small to="/" primary disabled>
            Back
          </LinkButton>
        </ButtonBar>
      </React.Fragment>
    )
  }

  const canSave = state.type === 'review' ? state.reviewComplete : false

  return (
    <React.Fragment>
      <Main>
        <BallotReviewColumns>
          <React.Fragment>
            <div>
              <img
                src={ballot.ballot.image.url}
                alt="Scanned Ballot"
                width={scale(ballot.ballot.image.width)}
                height={scale(ballot.ballot.image.height)}
              />
              {ballot.type === 'ReviewMarginalMarksBallot' &&
                ballot.contests.map((contest, contestIndex) =>
                  contest.options.map((option, optionIndex) => (
                    <ContestOptionButton
                      title={option.name}
                      rect={scale.rect(
                        ballot.layout[contestIndex].options[optionIndex].bounds
                      )}
                      data-contest-id={contest.id}
                      data-contest-option-id={option.id}
                      key={`${ballot.layout[contestIndex].options[optionIndex].bounds.x},${ballot.layout[contestIndex].options[optionIndex].bounds.y}`}
                      {...getContestOptionDecoration(contest, option)}
                      onClick={onContestOptionClick}
                    >
                      {option.name}
                    </ContestOptionButton>
                  ))
                )}
            </div>
            <Prose maxWidth={false}>
              {ballot.contests.map((contest) => (
                <React.Fragment key={contest.id}>
                  <h4>{contest.title}</h4>
                  <p>
                    {contest.options.map((option) => {
                      const { current, changed } = getContestOptionDecoration(
                        contest,
                        option
                      )

                      return (
                        <ContestOptionCheckbox
                          key={option.id}
                          current={current}
                          changed={changed}
                        >
                          <input
                            type="checkbox"
                            id={`contest-option-sidebar-${contest.id}-${option.id}`}
                            data-contest-id={contest.id}
                            data-contest-option-id={option.id}
                            onClick={onContestOptionClick}
                          />
                          <label
                            htmlFor={`contest-option-sidebar-${contest.id}-${option.id}`}
                          >
                            {option.name}{' '}
                            {(changed ?? current) === MarkStatus.Marginal &&
                              '⚠'}
                          </label>
                        </ContestOptionCheckbox>
                      )
                    })}
                  </p>
                </React.Fragment>
              ))}
            </Prose>
          </React.Fragment>
        </BallotReviewColumns>
      </Main>
      <ButtonBar secondary naturalOrder separatePrimaryButton>
        <Brand>
          VxScan
          {isTestMode && <React.Fragment>&nbsp;TEST&nbsp;MODE</React.Fragment>}
        </Brand>
        <LinkButton small to="/">
          Dashboard
        </LinkButton>
        <Text white>
          {pluralize('ballot', adjudicationStatus.adjudicated, true)}{' '}
          adjudicated, {adjudicationStatus.remaining - 1} remaining.
        </Text>
        <Button
          small
          primary
          disabled={!canSave}
          onPress={onSaveClick}
          title={
            canSave
              ? undefined
              : 'Cannot save until all contests have been adjudicated'
          }
        >
          Save &amp; Next
        </Button>
      </ButtonBar>
    </React.Fragment>
  )
}
