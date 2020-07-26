import * as assert from 'assert'
import {
  Contest,
  ContestOption,
  DeepReadonly,
  ReviewBallot,
  MarksByContestId,
} from '../config/types'

import { MarkStatus } from '../config/types/ballot-review'

export type State = Failed | Init | Review | Done | NoBallots

export type Failed = DeepReadonly<{
  type: 'failed'
  error?: Error
  previousState: State
}>

export type Init = DeepReadonly<{
  type: 'init'
}>

export type Review = DeepReadonly<{
  type: 'review'
  ballot: ReviewBallot
  changes: MarksByContestId
  hasChanges: boolean
  reviewComplete: boolean
}>

export type Done = DeepReadonly<{
  type: 'done'
  ballot: ReviewBallot
  changes: MarksByContestId
}>

export type NoBallots = DeepReadonly<{
  type: 'no-ballots'
}>

export function fail(previousState: State, err?: string | Error): Failed {
  return {
    type: 'failed',
    previousState,
    error: typeof err === 'string' ? new Error(err) : err,
  }
}

export function init(): Init {
  return { type: 'init' }
}

function normalizeChanges(
  ballot: ReviewBallot,
  changes: MarksByContestId
): { changes: MarksByContestId; hasChanges: boolean; reviewComplete: boolean } {
  if (ballot.type === 'ReviewUninterpretableHmpbBallot') {
    return { changes, hasChanges: true, reviewComplete: true }
  }

  const normalized: MarksByContestId = {}
  let hasChanges = false

  for (const [contestId, marksByOptionId] of Object.entries(changes)) {
    for (const [optionId, marked] of Object.entries(marksByOptionId!)) {
      const originalMarked = ballot.marks?.[contestId]?.[optionId]

      if (originalMarked !== marked) {
        const normalizedMarksByOptionId = normalized[contestId] ?? {}
        normalizedMarksByOptionId[optionId] = marked
        normalized[contestId] = normalizedMarksByOptionId
        hasChanges = true
      }
    }
  }

  let reviewComplete = true

  for (const [contestId, marksByOptionId] of Object.entries(
    ballot.marks ?? {}
  )) {
    for (const [optionId, mark] of Object.entries(marksByOptionId ?? {})) {
      if ((normalized[contestId]?.[optionId] ?? mark) === MarkStatus.Marginal) {
        reviewComplete = false
      }
    }
  }

  return { changes: normalized, hasChanges, reviewComplete }
}

export function fetchedBallotInfo(state: Init, ballot: ReviewBallot): Review {
  assert.equal(state.type, 'init')
  return {
    type: 'review',
    ballot,
    ...normalizeChanges(ballot, {}),
  }
}

export function change(
  state: Review,
  contest: Contest,
  option: ContestOption,
  marked: MarkStatus
): Review {
  assert.equal(state.type, 'review')
  const { ballot, changes } = state

  return {
    type: 'review',
    ballot,
    ...normalizeChanges(ballot, {
      ...changes,
      [contest.id]: {
        ...changes[contest.id],
        [option.id]: marked,
      },
    }),
  }
}

export function toggle(
  state: Review,
  contest: Contest,
  option: ContestOption
): Review {
  assert.equal(state.type, 'review')
  const { ballot, changes } = state
  const changedMark = changes[contest.id]?.[option.id]
  const currentMark =
    'marks' in ballot && ballot.marks?.[contest.id]?.[option.id]

  return change(
    state,
    contest,
    option,
    (changedMark ?? currentMark) === MarkStatus.Marked // these parentheses matter, as it seems === otherwise takes precedence.
      ? MarkStatus.Unmarked
      : MarkStatus.Marked
  )
}

export function noBallots(state: Init): NoBallots {
  assert.equal(state.type, 'init')
  return { type: 'no-ballots' }
}

export function finalize(state: Review): Done {
  assert.equal(state.type, 'review')
  const { ballot, changes } = state

  return {
    type: 'done',
    ballot,
    changes,
  }
}
