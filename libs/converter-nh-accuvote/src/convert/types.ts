import { Result } from '@votingworks/basics';
import { BallotPaperSize, GridPosition, Size } from '@votingworks/types';
import { ZodError } from 'zod';
import { PartialTimingMarks } from '@votingworks/ballot-interpreter';
import { PDFDocument } from 'pdf-lib';
import { ParseConstitutionalQuestionError } from './parse_constitutional_questions';
import { PdfReader } from '../pdf_reader';

/**
 * The kinds of errors that can occur during `pairColumnEntries`.
 */
export enum PairColumnEntriesIssueKind {
  ColumnCountMismatch = 'ColumnCountMismatch',
  ColumnEntryCountMismatch = 'ColumnEntryCountMismatch',
}

/**
 * Errors that can occur during `pairColumnEntries`.
 */
export type PairColumnEntriesIssue<T extends GridEntry, U extends GridEntry> =
  | {
      kind: PairColumnEntriesIssueKind.ColumnCountMismatch;
      message: string;
      columnCounts: [number, number];
    }
  | {
      kind: PairColumnEntriesIssueKind.ColumnEntryCountMismatch;
      message: string;
      columnIndex: number;
      columnEntryCounts: [number, number];
      extraLeftEntries: T[];
      extraRightEntries: U[];
    };

/**
 * Result of {@link pairColumnEntries}. The `issues` property is an array of
 * issues that occurred during the pairing process. The `Err` variant still has
 * `pairs`, but they will only be partially populated.
 */
export type PairColumnEntriesResult<
  T extends GridEntry,
  U extends GridEntry,
> = Result<
  {
    readonly pairs: ReadonlyArray<[T, U]>;
  },
  {
    readonly pairs: ReadonlyArray<[T, U]>;
    readonly issues: ReadonlyArray<PairColumnEntriesIssue<T, U>>;
  }
>;

/**
 * Contains the metadata and ballot template for a ballot card.
 */
export interface NewHampshireBallotCardDefinition {
  /**
   * XML element containing the ballot card definition, including election info
   * and contests with candidates.
   */
  readonly definition: Element;

  readonly definitionPath: string;

  /**
   * PDF reader containing the ballot card.
   */
  readonly ballotPdf: PdfReader;

  /**
   * The pages of the ballot PDF to use for this card. The first page is 1. If
   * this is not specified, the PDF must contain only one ballot card (i.e.
   * exactly two pages).
   */
  readonly pages?: [number, number];

  /**
   * If provided, the PDF document to write to for debugging.
   */
  readonly debugPdf?: PDFDocument;
}

/**
 * Contains candidate elements and their LCM column/row coordinates.
 */
export interface CandidateGridElement {
  readonly element: Element;
  readonly column: number;
  readonly row: number;
}

/**
 * Basic properties for an object located on a grid.
 */
export interface GridEntry {
  readonly side: 'front' | 'back';
  readonly column: number;
  readonly row: number;
}

/**
 * Kinds of errors that can occur when converting a ballot card definition.
 */
export enum ConvertIssueKind {
  ElectionValidationFailed = 'ElectionValidationFailed',
  InvalidBallotSize = 'InvalidBallotSize',
  InvalidDistrictId = 'InvalidDistrictId',
  InvalidElectionDate = 'InvalidElectionDate',
  InvalidBallotTemplateNumPages = 'InvalidBallotTemplateNumPages',
  InvalidTemplateSize = 'InvalidTemplateSize',
  InvalidTimingMarkMetadata = 'InvalidTimingMarkMetadata',
  MismatchedBallotImageSize = 'MismatchedBallotImageSize',
  MismatchedOvalGrids = 'MismatchedOvalGrids',
  MismatchedPrimaryPartyElections = 'MismatchedPrimaryPartyElections',
  MissingDefinitionProperty = 'MissingDefinitionProperty',
  MissingTimingMarkMetadata = 'MissingTimingMarkMetadata',
  TimingMarkDetectionFailed = 'TimingMarkDetectionFailed',
  ConstitutionalQuestionError = 'ConstitutionalQuestionError',
}

/**
 * Represents a bubble found in a ballot template.
 */
export interface TemplateBubble {
  readonly row: number;
  readonly column: number;
}

/**
 * A grid entry for a specific template oval.
 */
export type TemplateBubbleGridEntry = TemplateBubble & {
  side: 'front' | 'back';
};

/**
 * Issues that can occur when converting a ballot card definition.
 */
export type ConvertIssue =
  | {
      kind: ConvertIssueKind.ElectionValidationFailed;
      message: string;
      validationError: Error;
    }
  | {
      kind: ConvertIssueKind.InvalidBallotSize;
      message: string;
      invalidBallotSize: string;
    }
  | {
      kind: ConvertIssueKind.InvalidBallotTemplateNumPages;
      message: string;
    }
  | {
      kind: ConvertIssueKind.InvalidTemplateSize;
      message: string;
      paperSize?: BallotPaperSize;
      frontTemplateSize: Size;
      backTemplateSize: Size;
    }
  | {
      kind: ConvertIssueKind.InvalidDistrictId;
      message: string;
      invalidDistrictId: string;
    }
  | {
      kind: ConvertIssueKind.InvalidElectionDate;
      message: string;
      invalidDate: string;
    }
  | {
      kind: ConvertIssueKind.InvalidTimingMarkMetadata;
      message: string;
      side: 'front' | 'back';
      timingMarks: PartialTimingMarks;
      timingMarkBits: readonly boolean[];
      validationError?: ZodError;
    }
  | {
      kind: ConvertIssueKind.MismatchedOvalGrids;
      message: string;
      pairColumnEntriesIssue: PairColumnEntriesIssue<
        GridPosition,
        TemplateBubbleGridEntry
      >;
    }
  | {
      kind: ConvertIssueKind.MismatchedPrimaryPartyElections;
      message: string;
    }
  | {
      kind: ConvertIssueKind.MissingDefinitionProperty;
      message: string;
      property: string;
    }
  | {
      kind: ConvertIssueKind.MissingTimingMarkMetadata;
      message: string;
      side: 'front' | 'back';
      timingMarks: PartialTimingMarks;
    }
  | {
      kind: ConvertIssueKind.TimingMarkDetectionFailed;
      message: string;
      side: 'front' | 'back';
    }
  | {
      kind: ConvertIssueKind.ConstitutionalQuestionError;
      message: string;
      error: ParseConstitutionalQuestionError;
    };

/**
 * A result that reports any issues in either the ok or err case.
 */
export type ResultWithIssues<T> = Result<
  {
    readonly result: T;
    readonly issues: readonly ConvertIssue[];
  },
  {
    readonly issues: readonly ConvertIssue[];
  }
>;
