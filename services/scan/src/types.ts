import {
  BallotLocales,
  BallotMark,
  BallotTargetMark,
  ElectionDefinition,
  MarkAdjudications,
  MarkStatus,
  MarkThresholds,
  PageInterpretation,
  PrecinctId,
} from '@votingworks/types';
import { BallotStyleData } from '@votingworks/utils';
import { DateTime } from 'luxon';

export type SheetOf<T> = [T, T];

export interface ElectionRecord {
  readonly id: string;
  readonly definition: ElectionDefinition;
  readonly electionHash: string;
  readonly testMode: boolean;
  readonly markThresholdOverrides?: MarkThresholds;
  readonly currentPrecinctId?: PrecinctId;
  readonly createdAt: DateTime;
}

export interface PageInterpretationWithFiles {
  originalFilename: string;
  normalizedFilename: string;
  interpretation: PageInterpretation;
}

export interface PageInterpretationWithAdjudication<
  T extends PageInterpretation = PageInterpretation
> {
  interpretation: T;
  contestIds?: readonly string[];
  markAdjudications?: MarkAdjudications;
}

export interface BallotPageQrcode {
  data: Uint8Array;
  position: 'top' | 'bottom';
}

export interface BallotConfig extends BallotStyleData {
  filename: string;
  locales: BallotLocales;
  isLiveMode: boolean;
}

export interface BallotTemplate {
  /**
   * The ballot template's source PDF file.
   */
  readonly pdf: Buffer;

  /**
   * The ballot template's sheet templates.
   */
  readonly sheetTemplates: readonly BallotSheetTemplate[];
}

export interface BallotTemplateRecord {
  /**
   * The ballot template's unique identifier.
   */
  readonly id: string;

  /**
   * The ballot template's source PDF file, if loaded.
   */
  readonly pdf?: Buffer;

  /**
   * The ballot template's sheet templates, if loaded.
   */
  readonly sheetTemplates?: readonly BallotSheetTemplateRecord[];
}

export interface BallotSheetTemplate {
  /**
   * Opaque identifier for the front of the ballot sheet template.
   */
  readonly frontIdentifier: string;

  /**
   * Opaque identifier for the back of the ballot sheet template.
   */
  readonly backIdentifier: string;

  /**
   * Opaque layout information for the front of the ballot sheet template.
   */
  readonly frontLayout: string;

  /**
   * Opaque layout information for the back of the ballot sheet template.
   */
  readonly backLayout: string;
}

export interface BallotSheetTemplateRecord {
  /**
   * The ballot sheet template's unique identifier.
   */
  readonly id: string;

  /**
   * The parent ballot template's unique identifier.
   */
  readonly ballotTemplateId: string;

  /**
   * Opaque identifier for the front of the ballot sheet template.
   */
  readonly frontIdentifier: string;

  /**
   * Opaque identifier for the back of the ballot sheet template.
   */
  readonly backIdentifier: string;

  /**
   * Opaque layout information for the front of the ballot sheet template.
   */
  readonly frontLayout: string;

  /**
   * Opaque layout information for the back of the ballot sheet template.
   */
  readonly backLayout: string;
}

export * from './types/ballot_review';

export function getMarkStatus(
  mark: BallotTargetMark,
  markThresholds: MarkThresholds
): MarkStatus {
  if (mark.score >= markThresholds.definite) {
    return MarkStatus.Marked;
  }

  if (mark.score >= markThresholds.marginal) {
    return MarkStatus.Marginal;
  }

  if (
    mark.type === 'candidate' &&
    typeof mark.writeInTextScore === 'number' &&
    typeof markThresholds.writeInText === 'number' &&
    mark.writeInTextScore >= markThresholds.writeInText
  ) {
    return MarkStatus.UnmarkedWriteIn;
  }

  return MarkStatus.Unmarked;
}

export function isMarginalMark(
  mark: BallotMark,
  markThresholds: MarkThresholds
): boolean {
  return getMarkStatus(mark, markThresholds) === MarkStatus.Marginal;
}
