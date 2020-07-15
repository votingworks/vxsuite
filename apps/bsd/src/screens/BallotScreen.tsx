import { Rect } from '@votingworks/hmpb-interpreter'
import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ContestOptionButton from '../components/ContestOptionButton'
import Prose from '../components/Prose'
import {
  Contest,
  ContestOption,
  DeepReadonly,
  MarkStatus,
  ReviewBallot,
} from '../config/types'
import fetchJSON from '../util/fetchJSON'
import * as workflow from '../workflows/BallotScreenWorkflow'

const ListWithEmptyState = ({
  empty,
  children,
}: {
  empty: React.ReactElement
  children: readonly React.ReactChild[]
}) => {
  if (children.length === 0) {
    return empty
  }

  return <React.Fragment>{children}</React.Fragment>
}

export default function BallotScreen() {
  const { ballotId } = useParams<{
    ballotId?: string
  }>()
  const [state, setState] = useState<workflow.State>(workflow.init())
  const ballot =
    state.type === 'init' || state.type === 'failed' ? undefined : state.ballot

  useEffect(() => {
    if (state.type === 'init') {
      fetchJSON<ReviewBallot>(`/scan/hmpb/ballot/${ballotId}`)
        .then((newBallot) => {
          setState(workflow.fetchedBallotInfo(state, newBallot))
        })
        .catch((error) => {
          setState(workflow.fail(state, error))
        })
    }
  }, [ballotId, state, setState])

  const scale = useCallback(
    <T extends number | undefined>(value: T): T =>
      (typeof value === 'number'
        ? value * (800 / (ballot?.ballot.image.width ?? 800))
        : value) as T,
    [ballot]
  )

  const scaleRect = useCallback(
    (rect: Rect) => ({
      x: scale(rect.x),
      y: scale(rect.y),
      width: scale(rect.width),
      height: scale(rect.height),
    }),
    [scale]
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
        setState((previous) =>
          workflow.toggle(previous, contest, contestOption)
        )
      }
    },
    [state]
  )

  const getContestOptionDecoration = useCallback(
    (
      contest: DeepReadonly<Contest>,
      option: DeepReadonly<ContestOption>
    ): { original: MarkStatus; changed?: MarkStatus } => {
      if (state.type === 'review' || state.type === 'done') {
        const original =
          state.ballot.marks[contest.id]?.[option.id] ?? MarkStatus.Unmarked
        const changed = state.changes[contest.id]?.[option.id]
        return { original, changed }
      }

      return { original: MarkStatus.Unmarked }
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

        setState(
          workflow.fetchedBallotInfo(
            workflow.init(),
            await fetchJSON(state.ballot.ballot.url, {
              method: 'GET',
            })
          )
        )
      } catch (error) {
        setState(workflow.fail(error))
      }
    })()
  }, [state])

  if (state.type === 'failed') {
    return <p>An error occurred</p>
  }

  if (state.type === 'init' || !ballot) {
    return <p>Loading…</p>
  }

  const hasChanges = Object.keys(state.changes).length > 0

  return (
    <React.Fragment>
      <Prose maxWidth={false}>
        <h1>Ballot</h1>
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
                rect={scaleRect(option.bounds)}
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
            <dl>
              {ballot.contests.map((contest) => (
                <React.Fragment key={contest.id}>
                  <dt>{contest.title}</dt>
                  <dd>
                    <ListWithEmptyState empty={<span>(none)</span>}>
                      {contest.options
                        .filter((option) => {
                          const {
                            original,
                            changed,
                          } = getContestOptionDecoration(contest, option)

                          return (
                            original === MarkStatus.Marked ||
                            changed === MarkStatus.Marked
                          )
                        })
                        .map((option, i, options) => {
                          const { changed } = getContestOptionDecoration(
                            contest,
                            option
                          )

                          return (
                            <React.Fragment key={option.id}>
                              <span
                                style={{
                                  textDecoration:
                                    changed === MarkStatus.Unmarked
                                      ? 'line-through red'
                                      : changed === MarkStatus.Marked
                                      ? 'underline green'
                                      : undefined,
                                }}
                              >
                                {option.name}
                              </span>

                              {i < options.length - 1 ? ', ' : ''}
                            </React.Fragment>
                          )
                        })}
                    </ListWithEmptyState>
                  </dd>
                </React.Fragment>
              ))}
            </dl>

            <button type="submit" disabled={!hasChanges} onClick={onSaveClick}>
              Save Ballot
            </button>
          </div>
        </div>
      </Prose>
    </React.Fragment>
  )
}
