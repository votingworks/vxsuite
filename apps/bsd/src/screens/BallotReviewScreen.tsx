import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchBallotInfo, fetchNextBallotToReview } from '../api/hmpb'
import ContestOptionButton from '../components/ContestOptionButton'
import ContestOptionCheckbox from '../components/ContestOptionCheckbox'
import Prose from '../components/Prose'
import {
  Contest,
  ContestOption,
  DeepReadonly,
  MarkStatus,
} from '../config/types'
import fetchJSON from '../util/fetchJSON'
import { scaler } from '../util/scale'
import * as workflow from '../workflows/BallotReviewScreenWorkflow'
import Main, { MainChild } from '../components/Main'
import ButtonBar from '../components/ButtonBar'
import Brand from '../components/Brand'
import Button from '../components/Button'

export interface Props {
  isTestMode: boolean
}

export default function BallotReviewScreen({ isTestMode }: Props) {
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
          state.ballot.marks[contest.id]?.[option.id] ?? MarkStatus.Unmarked
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
          <Button primary disabled>
            Save &amp; Next
          </Button>
        </ButtonBar>
      </React.Fragment>
    )
  }

  if (state.type === 'no-ballots') {
    return (
      <React.Fragment>
        <Main>
          <MainChild maxWidth={false}>
            <Prose maxWidth={false}>
              <p>No ballots needing review were found.</p>
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
          <Button primary disabled>
            Save &amp; Next
          </Button>
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
              <p>Loading…</p>
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
          <Button primary disabled>
            Save &amp; Next
          </Button>
        </ButtonBar>
      </React.Fragment>
    )
  }

  const canSave = state.type === 'review' ? state.reviewComplete : false

  return (
    <React.Fragment>
      <Main>
        <MainChild maxWidth={false}>
          <Prose maxWidth={false}>
            <div
              style={{
                position: 'relative',
                width: scale(ballot.ballot.image.width),
              }}
            >
              <img
                src={ballot.ballot.image.url}
                alt="Scanned Ballot"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: scale(ballot.ballot.image.width),
                  height: scale(ballot.ballot.image.height),
                }}
              />
              {ballot.contests.map((contest) =>
                contest.options.map((option) => (
                  <ContestOptionButton
                    title={option.name}
                    rect={scale.rect(option.bounds)}
                    data-contest-id={contest.id}
                    data-contest-option-id={option.id}
                    key={`${option.bounds.x},${option.bounds.y}`}
                    {...getContestOptionDecoration(contest, option)}
                    onClick={onContestOptionClick}
                  >
                    {option.name}
                  </ContestOptionButton>
                ))
              )}
              <div
                style={{
                  position: 'absolute',
                  left: scale(ballot.ballot.image.width),
                  width: 800,
                  marginLeft: 20,
                }}
              >
                <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                  {ballot.contests.map((contest) => (
                    <li key={contest.id}>
                      <h4 style={{ marginBottom: 0 }}>{contest.title}</h4>
                      <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                        {contest.options.map((option) => {
                          const {
                            current,
                            changed,
                          } = getContestOptionDecoration(contest, option)

                          return (
                            <li key={option.id}>
                              <ContestOptionCheckbox
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
                                  {(changed ?? current) ===
                                    MarkStatus.Marginal && '⚠'}
                                </label>
                              </ContestOptionCheckbox>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Prose>
        </MainChild>
      </Main>
      <ButtonBar secondary naturalOrder separatePrimaryButton>
        <Brand>
          VxScan
          {isTestMode && <React.Fragment>&nbsp;TEST&nbsp;MODE</React.Fragment>}
        </Brand>
        <Button
          primary
          disabled={!canSave}
          onClick={onSaveClick}
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
