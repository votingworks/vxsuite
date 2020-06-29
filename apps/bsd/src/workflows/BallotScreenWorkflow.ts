import {
  Contest,
  ContestOption,
  DeepReadonly,
  ReviewBallot,
  MarksByContestId,
} from '../config/types'

export type State = Failed | Init | Review | Done

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
}>

export type Done = DeepReadonly<{
  type: 'done'
  ballot: ReviewBallot
  changes: MarksByContestId
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

export function fetchedBallotInfo(state: State, ballot: ReviewBallot): State {
  return {
    type: 'review',
    ballot,
    changes: {},
  }
}

function normalizeChanges(
  ballot: ReviewBallot,
  changes: MarksByContestId
): MarksByContestId {
  const normalized: MarksByContestId = {}

  for (const [contestId, marksByOptionId] of Object.entries(changes)) {
    for (const [optionId, marked] of Object.entries(marksByOptionId!)) {
      // It wasn't marked if the value is `false` or `undefined`.
      const originallyMarked = ballot.marks[contestId]?.[optionId] === true

      if (originallyMarked !== marked) {
        const normalizedMarksByOptionId = normalized[contestId] ?? {}
        normalizedMarksByOptionId[optionId] = marked
        normalized[contestId] = normalizedMarksByOptionId
      }
    }
  }

  return normalized
}

export function change(
  state: State,
  contest: Contest,
  option: ContestOption,
  marked: boolean
): State {
  if (state.type !== 'review') {
    throw new Error(
      `changes can only be made while in review (state=${state.type})`
    )
  }

  const { ballot, changes } = state

  return {
    type: 'review',
    ballot,
    changes: normalizeChanges(ballot, {
      ...changes,
      [contest.id]: {
        ...changes[contest.id],
        [option.id]: marked,
      },
    }),
  }
}

export function toggle(
  state: State,
  contest: Contest,
  option: ContestOption
): State {
  if (state.type !== 'review') {
    throw new Error(
      `changes can only be made while in review (state=${state.type})`
    )
  }

  const { ballot, changes } = state

  return change(
    state,
    contest,
    option,
    !(changes[contest.id]?.[option.id] ?? ballot.marks[contest.id]?.[option.id])
  )
}

export function finalize(state: State): State {
  if (state.type !== 'review') {
    throw new Error(
      `changes can only be finalized while in review (state=${state.type})`
    )
  }

  const { ballot, changes } = state

  return {
    type: 'review',
    ballot,
    changes,
  }
}
