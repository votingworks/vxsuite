import { Rect } from '@votingworks/hmpb-interpreter'
import React, { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import styled from 'styled-components'
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

const ContestOptionCheckbox = styled.div<{
  current: MarkStatus
  changed?: MarkStatus
}>`
  * {
    cursor: pointer;
    color: ${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? '#006600ee'
        : changed === MarkStatus.Unmarked
        ? '#660000ee'
        : 'auto'}
  }

  > input {
    display: none;
    margin-left: 5px;
  }

  > label::before {
    /* stylelint-disable-next-line string-no-newline */
    content: '${({ current, changed }) =>
      (changed ?? current) === MarkStatus.Marked
        ? '☑'
        : changed === MarkStatus.Unmarked
        ? '☒'
        : '☐'}'
  }
`

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
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {ballot.contests.map((contest) => (
                <li key={contest.id}>
                  <h4 style={{ marginBottom: 0 }}>{contest.title}</h4>
                  <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                    {contest.options.map((option) => {
                      const { current, changed } = getContestOptionDecoration(
                        contest,
                        option
                      )

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
                              {option.name}
                            </label>
                          </ContestOptionCheckbox>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>

            <button type="submit" disabled={!hasChanges} onClick={onSaveClick}>
              Save Ballot
            </button>
          </div>
        </div>
      </Prose>
    </React.Fragment>
  )
}
