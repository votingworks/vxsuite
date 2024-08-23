import { Result } from '@votingworks/basics';
import {
  BallotPaperSize,
  BallotStyleId,
  BallotStyleIdSchema,
  BallotType,
  BallotTypeSchema,
  PrecinctId,
  PrecinctIdSchema,
  SheetOf,
  Side,
  Size,
} from '@votingworks/types';
import { z } from 'zod';
import { PdfReader } from '../pdf_reader';
import {
  type CandidateName,
  type OfficeName,
  type YesNoQuestion,
} from './accuvote';
import { BallotGridPoint } from './coordinates';
import {
  ConstitutionalQuestion,
  ParseConstitutionalQuestionError,
} from './parse_constitutional_questions';

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
}

/**
 * Basic properties for an object located on a grid.
 */
export interface GridEntry {
  readonly side: Side;
  readonly column: number;
  readonly row: number;
}

/**
 * Kinds of errors that can occur when converting a ballot card definition.
 */
export enum ConvertIssueKind {
  ElectionValidationFailed = 'ElectionValidationFailed',
  InvalidBallotSize = 'InvalidBallotSize',
  InvalidElectionDate = 'InvalidElectionDate',
  InvalidBallotTemplateNumPages = 'InvalidBallotTemplateNumPages',
  InvalidTemplateSize = 'InvalidTemplateSize',
  MismatchedPrimaryPartyElections = 'MismatchedPrimaryPartyElections',
  MissingDefinitionProperty = 'MissingDefinitionProperty',
  TimingMarkDetectionFailed = 'TimingMarkDetectionFailed',
  ConstitutionalQuestionError = 'ConstitutionalQuestionError',
  BubbleMatchingFailed = 'BubbleMatchingFailed',
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
  side: Side;
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
      kind: ConvertIssueKind.InvalidElectionDate;
      message: string;
      invalidDate: string;
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
      kind: ConvertIssueKind.TimingMarkDetectionFailed;
      message: string;
      side: Side;
    }
  | {
      kind: ConvertIssueKind.ConstitutionalQuestionError;
      message: string;
      error?: ParseConstitutionalQuestionError;
    }
  | {
      kind: ConvertIssueKind.BubbleMatchingFailed;
      message: string;
      error?: Error;
    };

/**
 * A result that reports any issues in either the ok or err case.
 */
export type ResultWithIssues<T> = Result<
  {
    result: T;
    issues: ConvertIssue[];
  },
  {
    issues: ConvertIssue[];
  }
>;

/**
 * Describes the types of bubble layouts for a ballot card.
 */
export enum BubbleLayout {
  /**
   * Contests are stacked vertically across multiple columns. Bubbles are laid
   * out vertically in a single timing mark grid column for each contest. All
   * stacked contests have bubbles in the same column.
   */
  Stacked = 'stacked',

  /**
   * Contests are stacked vertically and span the width of the ballot card. For
   * any given timing mark column, all bubbles in that column are for the same
   * political party, or for write-in candidates. There may be pairs of yes/no
   * bubbles at the end of the ballot card that do not follow this pattern.
   */
  StackedParty = 'stacked-party',
}

/**
 * Pairing of a candidate with a bubble grid position.
 */
export interface MatchedCandidate {
  type: 'candidate';
  office: OfficeName;
  candidate: CandidateName;
  bubble: BallotGridPoint;
}

/**
 * Pairing of a yes/no option with its bubble.
 */
export interface MatchedYesNoQuestionOption {
  type: 'yesno';
  question: YesNoQuestion;
  option: 'yes' | 'no';
  bubble: BallotGridPoint;
}

/**
 * Pairing of a constitutional question parsed from HTML with its yes/no bubbles.
 */
export interface MatchedHackyParsedConstitutionalQuestion {
  type: 'hacky-question';
  question: ConstitutionalQuestion;
  yesBubble: BallotGridPoint;
  noBubble: BallotGridPoint;
}

/**
 * Any of the match types.
 */
export type AnyMatched =
  | MatchedCandidate
  | MatchedYesNoQuestionOption
  | MatchedHackyParsedConstitutionalQuestion;

/**
 * Unmatched candidates.
 */
export interface UnmatchedCandidate {
  type: 'candidate';
  office: OfficeName;
  candidate: CandidateName;
}

/**
 * Unmatched bubbles.
 */
export interface UnmatchedBubble {
  type: 'bubble';
  side: Side;
  bubble: BallotGridPoint;
}

/**
 * Unmatched yes/no question options.
 */
export interface UnmatchedYesNoQuestionOption {
  type: 'yesno';
  question: YesNoQuestion;
  option: 'yes' | 'no';
}

/**
 * Unmatched hacky parsed constitutional questions.
 */
export interface UnmatchedHackyParsedConstitutionalQuestion {
  type: 'hacky-question';
  question: ConstitutionalQuestion;
}

/**
 * Any of the unmatched types.
 */
export type AnyUnmatched =
  | UnmatchedCandidate
  | UnmatchedBubble
  | UnmatchedYesNoQuestionOption
  | UnmatchedHackyParsedConstitutionalQuestion;

/**
 * Result of matching bubbles to candidates, yes/no questions, etc.
 */
export interface MatchBubblesResult {
  matched: SheetOf<AnyMatched[]>;
  unmatched: AnyUnmatched[];
}

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
  correctedDefinitionPath: string;
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
    correctedDefinitionPath: z.string().nonempty(),
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
