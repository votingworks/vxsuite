import { Rect } from '@votingworks/hmpb-interpreter'
import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import styled from 'styled-components'
import Prose from '../components/Prose'
import {
  ReviewBallot,
  Contest,
  ContestOption,
  DeepReadonly,
} from '../config/types'
import fetchJSON from '../util/fetchJSON'
import * as workflow from '../workflows/BallotScreenWorkflow'

const ContestOptionButton = styled.button<{
  rect: Rect
  marked: boolean
  pending: boolean
}>`
  position: absolute;
  color: transparent;
  background-color: ${({ marked, pending }) =>
    marked && !pending ? 'rgba(71,167,75,.4)' : 'transparent'};
  border: none;
  outline: none;
  cursor: pointer;
  left: ${({ rect }) => rect.x}px;
  top: ${({ rect }) => rect.y}px;
  width: ${({ rect }) => rect.width}px;
  height: ${({ rect }) => rect.height}px;

  ::after {
    position: absolute;
    top: ${({ rect }) => (rect.height - 28) / 2}px;
    right: ${30 - 28}px;
    width: 28px;
    height: 28px;

    /* stylelint-disable-next-line string-no-newline */
    content: '${({ marked, pending }) =>
      marked ? '☑️' : pending ? '☒' : '☐'}';
    color: ${({ marked, pending }) =>
      marked ? '#006600ee' : pending ? '#660000ee' : '#006600ee'};
  }

  :hover {
    background-color: ${({ marked }) =>
      !marked ? 'rgba(71,167,75,.2)' : 'rgba(71,167,75,.4)'};
  }
`

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
    ): { marked: boolean; pending: boolean } => {
      if (state.type === 'review' || state.type === 'done') {
        const wasMarked = state.ballot.marks[contest.id]?.[option.id]
        const newlyMarked = state.changes[contest.id]?.[option.id]
        const marked = (newlyMarked ?? wasMarked) === true
        const pending = typeof newlyMarked === 'boolean'
        return { marked, pending }
      }

      return { marked: false, pending: false }
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
                            marked,
                            pending,
                          } = getContestOptionDecoration(contest, option)

                          return marked || pending
                        })
                        .map((option, i, options) => {
                          const {
                            marked,
                            pending,
                          } = getContestOptionDecoration(contest, option)

                          return (
                            <React.Fragment key={option.id}>
                              <span
                                style={{
                                  textDecoration:
                                    !marked && pending
                                      ? 'line-through red'
                                      : marked && pending
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
