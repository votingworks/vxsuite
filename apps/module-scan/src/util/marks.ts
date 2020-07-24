import { strict as assert } from 'assert'
import {
  MarksByContestId,
  MarksByOptionId,
  MarkStatus,
} from '../types/ballot-review'
import { BallotMark, BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import { getMarkStatus, CastVoteRecord } from '../types'
import { getMachineId } from './machineId'
import { v4 as uuid4 } from 'uuid'

/**
 * Merges a list of changes to an original set of marks into each other,
 * returning the smallest difference from the original that contains the final
 * state.
 */
export function mergeChanges(
  original: MarksByContestId,
  ...changes: readonly MarksByContestId[]
): MarksByContestId {
  const result: MarksByContestId = {}

  for (const change of changes) {
    for (const contestId of Object.keys({ ...original, ...change })) {
      const contestOptions: MarksByOptionId = result[contestId] ?? {}

      for (const optionId of Object.keys({
        ...original[contestId],
        ...change[contestId],
      })) {
        const changeMark = change[contestId]?.[optionId]
        const originalMark = original[contestId]?.[optionId]

        if (typeof changeMark !== 'undefined') {
          if (changeMark !== originalMark) {
            contestOptions[optionId] = changeMark
          } else {
            delete contestOptions[optionId]
          }
        }
      }

      if (Object.keys(contestOptions).length > 0) {
        result[contestId] = contestOptions
      } else {
        delete result[contestId]
      }
    }
  }

  return result
}

/**
 * Builds a contest option mark change object from a set of marks.
 */
export function changesFromMarks(
  marks: readonly BallotMark[]
): MarksByContestId {
  const result: MarksByContestId = {}

  for (const mark of marks) {
    if (mark.type === 'stray') {
      continue
    }

    result[mark.contest.id] = {
      ...result[mark.contest.id],
      [mark.type === 'candidate' ? mark.option.id : mark.option]: getMarkStatus(
        mark
      ),
    }
  }

  return result
}

function randomBallotId(): string {
  return uuid4()
}

/**
 * Builds a cast-vote record from a contest option mark change object plus
 * metadata. If there was an original CVR then we can pull metadata from it
 * too, but note that _the original CVR votes are not considered_.
 */
export function changesToCVR(
  changes: MarksByContestId,
  metadata: BallotPageMetadata,
  originalCVR?: CastVoteRecord
): CastVoteRecord {
  if (originalCVR) {
    assert.equal(originalCVR._ballotStyleId, metadata.ballotStyleId)
    assert.equal(originalCVR._precinctId, metadata.precinctId)
    assert.equal(originalCVR._pageNumber, metadata.pageNumber)
    assert.equal(originalCVR._testBallot, metadata.isTestBallot)
    assert.deepEqual(originalCVR._locales, metadata.locales)
  }

  const result: CastVoteRecord = {
    _ballotId: originalCVR?._ballotId ?? randomBallotId(),
    _ballotStyleId: metadata.ballotStyleId,
    _precinctId: metadata.precinctId,
    _pageNumber: metadata.pageNumber,
    _testBallot: metadata.isTestBallot,
    _locales: metadata.locales,
    _scannerId: originalCVR?._scannerId ?? getMachineId(),
  }

  for (const [contestId, marksByOptionId] of Object.entries(changes)) {
    result[contestId] = Object.entries(marksByOptionId!)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .flatMap(([optionId, markStatus]) =>
        markStatus === MarkStatus.Marked ? [optionId] : []
      )
  }

  return result
}
