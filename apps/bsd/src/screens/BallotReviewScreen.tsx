import React, { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useParams, useHistory } from 'react-router-dom'
import pluralize from 'pluralize'

import { fetchBallotInfo, fetchNextBallotToReview } from '../api/hmpb'
import ContestOptionButton from '../components/ContestOptionButton'
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
import relativeRect from '../util/relativeRect'
import * as workflow from '../workflows/BallotReviewScreenWorkflow'
import Main, { MainChild } from '../components/Main'
import ButtonBar from '../components/ButtonBar'
import Brand from '../components/Brand'
import Button from '../components/Button'
import LinkButton from '../components/LinkButton'
import Text from '../components/Text'
import Checkbox from '../components/Checkbox'

const BallotReviewColumns = styled.div`
  display: flex;
  flex-direction: row;
  > div {
    flex: 1;
  }
  > div:first-child {
    margin-right: 0.5rem;
    min-width: 50%;
  }
  > div:last-child {
    margin-left: 0.5rem;
  }
`

const BallotImageContainer = styled.div`
  position: relative;
  img {
    display: block;
  }
`
const Contests = styled.div`
  columns: 3;
  column-gap: 1rem;
  margin-top: 0.5rem;
  & > div {
    break-inside: avoid;
    margin-bottom: 1em;
  }
  button {
    position: relative;
    margin-bottom: 0.25em;
    padding-left: 1.5em;
    span {
      position: absolute;
      top: 0.45em;
      left: 0.5em;
    }
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

  const relRect = relativeRect(
    ballot?.ballot.image.width || 1,
    ballot?.ballot.image.height || 1
  )

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
              <BallotImageContainer>
                <img
                  src={ballot.ballot.image.url}
                  alt="Scanned Ballot"
                  width="100%"
                />
                {ballot.type === 'ReviewMarginalMarksBallot' &&
                  ballot.contests.map((contest, contestIndex) =>
                    contest.options.map((option, optionIndex) => (
                      <ContestOptionButton
                        title={option.name}
                        rect={relRect(
                          ballot.layout[contestIndex].options[optionIndex]
                            .bounds
                        )}
                        data-contest-id={contest.id}
                        data-contest-option-id={option.id}
                        key={`${ballot.layout[contestIndex].options[optionIndex].bounds.x},${ballot.layout[contestIndex].options[optionIndex].bounds.y}`}
                        {...getContestOptionDecoration(contest, option)}
                        tabIndex={-1}
                        onClick={onContestOptionClick}
                      >
                        {option.name}
                      </ContestOptionButton>
                    ))
                  )}
              </BallotImageContainer>
            </div>
            <div>
              <Contests>
                {ballot.contests.map((contest) => (
                  <Prose key={contest.id}>
                    <h4>{contest.title}</h4>
                    <p>
                      {contest.options.map((option, i) => {
                        const { current, changed } = getContestOptionDecoration(
                          contest,
                          option
                        )
                        return (
                          <Button
                            key={
                              option.bounds
                                ? `${option.bounds?.x},${option.bounds?.y}`
                                : `${i}`
                            }
                            small
                            fullWidth
                            textAlign="left"
                            noWrap={false}
                            primary={(changed ?? current) === MarkStatus.Marked}
                            danger={changed === MarkStatus.Unmarked}
                            warning={
                              changed === undefined &&
                              current === MarkStatus.Marginal
                            }
                            onPress={onContestOptionClick}
                            data-contest-id={contest.id}
                            data-contest-option-id={option.id}
                            style={{
                              textDecoration:
                                changed === MarkStatus.Unmarked
                                  ? 'line-through'
                                  : undefined,
                            }}
                          >
                            <Checkbox
                              isSelected={
                                (changed ?? current) === MarkStatus.Marked
                              }
                              isRemoved={changed === MarkStatus.Unmarked}
                              isUnknown={
                                changed === undefined &&
                                current === MarkStatus.Marginal
                              }
                            />{' '}
                            {option.name}
                          </Button>
                        )
                      })}
                    </p>
                  </Prose>
                ))}
              </Contests>
            </div>
          </React.Fragment>
        </BallotReviewColumns>
      </Main>
      <ButtonBar secondary naturalOrder separatePrimaryButton>
        <Brand>
          Adjudication
          {isTestMode && <React.Fragment>&nbsp;TEST&nbsp;MODE</React.Fragment>}
        </Brand>
        <Text white>
          {pluralize('ballot', adjudicationStatus.adjudicated, true)}{' '}
          adjudicated, {adjudicationStatus.remaining - 1} remaining.
        </Text>
        <LinkButton small to="/">
          Dashboard
        </LinkButton>
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
