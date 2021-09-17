import {
  BallotLocales,
  BallotMark,
  BallotTargetMark,
  MarkAdjudications,
  MarkStatus,
  MarkThresholds,
  PageInterpretation,
} from '@votingworks/types'
import { BallotStyleData } from '@votingworks/utils'

export type SheetOf<T> = [T, T]

export interface PageInterpretationWithFiles {
  originalFilename: string
  normalizedFilename: string
  interpretation: PageInterpretation
}

export interface PageInterpretationWithAdjudication<
  T extends PageInterpretation = PageInterpretation
> {
  interpretation: T
  contestIds?: readonly string[]
  markAdjudications?: MarkAdjudications
}

export interface BallotPageQrcode {
  data: Uint8Array
  position: 'top' | 'bottom'
}

export interface BallotConfig extends BallotStyleData {
  filename: string
  locales: BallotLocales
  isLiveMode: boolean
}

export * from './types/ballot-review'

export function getMarkStatus(
  mark: BallotTargetMark,
  markThresholds: MarkThresholds
): MarkStatus {
  if (mark.score >= markThresholds.definite) {
    return MarkStatus.Marked
  }

  if (mark.score >= markThresholds.marginal) {
    return MarkStatus.Marginal
  }

  if (
    mark.type === 'candidate' &&
    typeof mark.writeInTextScore === 'number' &&
    typeof markThresholds.writeInText === 'number' &&
    mark.writeInTextScore >= markThresholds.writeInText
  ) {
    return MarkStatus.UnmarkedWriteIn
  }

  return MarkStatus.Unmarked
}

export function isMarginalMark(
  mark: BallotMark,
  markThresholds: MarkThresholds
): boolean {
  return (
    mark.type !== 'stray' &&
    getMarkStatus(mark, markThresholds) === MarkStatus.Marginal
  )
}
