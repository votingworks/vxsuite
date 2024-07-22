import { Result } from '@votingworks/basics';
import {
  BallotPaperSize,
  BallotStyleId,
  BallotStyleIdSchema,
  BallotType,
  BallotTypeSchema,
  GridPosition,
  PrecinctId,
  PrecinctIdSchema,
  Size,
} from '@votingworks/types';
import { z, ZodError } from 'zod';
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

/**
 * Root of the configuration for the conversion process.
 */
export interface ConvertConfig {
  /**
   * The type of election being converted.
   */
  electionType: 'general' | 'primary';

  /**
   * Configuration for the election jurisdictions. Each one will become its own
   * election.
   */
  readonly jurisdictions: ConvertConfigJurisdiction[];

  /**
   * Whether to enable debug logging.
   */
  readonly debug?: boolean;
}

/**
 * Configuration for a single jurisdiction.
 */
export interface ConvertConfigJurisdiction {
  /**
   * The name of the jurisdiction, e.g. "Hillsborough County".
   */
  readonly name: string;

  /**
   * Configuration for the ballot cards.
   */
  readonly cards: ConvertConfigCard[];

  /**
   * Path to the output directory.
   */
  readonly output: string;
}

/**
 * Configuration for a single ballot card within a jurisdiction.
 */
export interface ConvertConfigCard {
  /**
   * Path to the XML definition file.
   */
  readonly definition: string;

  /**
   * Path to the PDF ballot file.
   */
  readonly ballot: string;

  /**
   * The pages of the ballot PDF to use for this card. The first page is 1. If
   * this is not specified, the PDF must contain only one ballot card (i.e.
   * exactly two pages).
   */
  readonly pages?: [number, number];
}

/**
 * Schema for {@link ConvertConfigCard}.
 */
export const ConvertConfigCardSchema: z.ZodSchema<ConvertConfigCard> = z.object(
  {
    definition: z.string(),
    ballot: z.string(),
    pages: z.tuple([z.number(), z.number()]).optional(),
  }
);

/**
 * Schema for {@link ConvertConfigJurisdiction}.
 */
export const ConvertConfigJurisdictionSchema: z.ZodSchema<ConvertConfigJurisdiction> =
  z.object({
    name: z.string().nonempty(),
    cards: z.array(ConvertConfigCardSchema),
    output: z.string(),
  });

/**
 * Schema for {@link ConvertConfig}.
 */
export const ConvertConfigSchema: z.ZodSchema<ConvertConfig> = z.object({
  electionType: z.union([z.literal('general'), z.literal('primary')]),
  jurisdictions: z.array(ConvertConfigJurisdictionSchema),
  debug: z.boolean().optional(),
});

/**
 * Root of the configuration to generate test decks.
 */
export interface GenerateTestDeckConfig {
  electionType: 'general' | 'primary';
  jurisdictions: GenerateTestDeckJurisdiction[];
}

/**
 * Configuration for a single jurisdiction to generate a test deck.
 */
export interface GenerateTestDeckJurisdiction {
  /**
   * The name of the jurisdiction, e.g. "Hillsborough County".
   */
  name: string;

  /**
   * Path to the `manifest.json` output from conversion.
   */
  input: string;

  /**
   * Path to the directory to write the generated test decks.
   */
  output: string;
}

/**
 * Root of the `manifest.json` file containing information about the output of
 * the conversion process.
 */
export interface ConvertOutputManifest {
  config: ConvertConfigJurisdiction;
  electionPath: string;
  cards: ConvertOutputCard[];
}

/**
 * Conversion output information for a single ballot card within a jurisdiction.
 */
export interface ConvertOutputCard {
  ballotPath: string;
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
}

/**
 * Schema for {@link ConvertOutputCard}.
 */
export const ConvertOutputCardSchema: z.ZodSchema<ConvertOutputCard> = z.object(
  {
    ballotPath: z.string().nonempty(),
    precinctId: PrecinctIdSchema,
    ballotStyleId: BallotStyleIdSchema,
    ballotType: BallotTypeSchema,
  }
);

/**
 * Schema for {@link ConvertOutputManifest}.
 */
export const ConvertOutputManifestSchema: z.ZodSchema<ConvertOutputManifest> =
  z.object({
    config: ConvertConfigJurisdictionSchema,
    electionPath: z.string().nonempty(),
    cards: z.array(ConvertOutputCardSchema),
  });

/**
 * Schema for {@link GenerateTestDeckJurisdiction}.
 */
export const GenerateTestDeckJurisdictionSchema: z.ZodSchema<GenerateTestDeckJurisdiction> =
  z.object({
    name: z.string().nonempty(),
    input: z.string().nonempty(),
    output: z.string().nonempty(),
  });

/**
 * Schema for {@link GenerateTestDeckConfig}.
 */
export const GenerateTestDeckConfigSchema: z.ZodSchema<GenerateTestDeckConfig> =
  z.object({
    electionType: z.union([z.literal('general'), z.literal('primary')]),
    jurisdictions: z.array(GenerateTestDeckJurisdictionSchema),
  });
