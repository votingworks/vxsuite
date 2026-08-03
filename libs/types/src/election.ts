import { Optional, DateWithoutTime, iter } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { z } from 'zod/v4';
import {
  Sha256Hash,
  Id,
  IdSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
  DateWithoutTimeSchema,
} from './generic';
import {
  Offset,
  OffsetSchema,
  Rect,
  RectSchema,
  Size,
  SizeSchema,
} from './geometry';
import {
  UiStringsPackage,
  UiStringsPackageSchema,
} from './ui_string_translations';

// Generic
function* findDuplicateIds<T extends { id: unknown }>(
  identifiables: Iterable<T>
): Generator<[number, T['id']]> {
  const knownIds = new Set<T['id']>();

  for (const [index, { id }] of [...identifiables].entries()) {
    if (knownIds.has(id)) {
      yield [index, id];
    } else {
      knownIds.add(id);
    }
  }
}

export type PartyId = string;
export const PartyIdSchema = IdSchema;
export interface Party {
  readonly id: PartyId;
  readonly name: string;
  readonly fullName: string;
  readonly abbrev: string;
}
export const PartySchema: z.ZodSchema<Party> = z.object({
  id: PartyIdSchema,
  name: z.string().nonempty(),
  fullName: z.string().nonempty(),
  abbrev: z.string().nonempty(),
});

export type Parties = readonly Party[];
export const PartiesSchema: z.ZodSchema<Parties> = z
  .array(PartySchema)
  .check((ctx) => {
    const parties = ctx.value;
    for (const [index, id] of findDuplicateIds(parties)) {
      ctx.issues.push({
        code: 'custom',
        path: [index, 'id'],
        message: `Duplicate party '${id}' found.`,
        input: parties,
      });
    }
  });

export type DistrictId = string;
export const DistrictIdSchema = IdSchema;
export interface District {
  readonly id: DistrictId;
  readonly name: string;
}
export const DistrictSchema: z.ZodSchema<District> = z.object({
  id: DistrictIdSchema,
  name: z.string().nonempty(),
});
export const DistrictsSchema = z
  .array(DistrictSchema)
  .nonempty()
  .check((ctx) => {
    const districts = ctx.value;
    for (const [index, id] of findDuplicateIds(districts)) {
      ctx.issues.push({
        code: 'custom',
        path: [index, 'id'],
        message: `Duplicate district '${id}' found.`,
        input: districts,
      });
    }
  });

// Candidates
export type WriteInId = `write-in` | `write-in-${string}`;
export const WriteInIdSchema = z
  .string()
  .nonempty()
  .refine(
    (id) => /^write-in(-.+)?$/.test(id),
    `Write-In ID does not match expected format.`
  ) as z.ZodSchema<WriteInId>;
export type CandidateId = Id | WriteInId;
export const CandidateIdSchema: z.ZodSchema<CandidateId> = z.union([
  IdSchema,
  WriteInIdSchema,
]);
export interface Candidate {
  readonly id: CandidateId;
  readonly name: string;
  readonly partyIds?: readonly PartyId[];
  readonly isWriteIn?: boolean;
  readonly writeInIndex?: number;
  // Structured name properties are supported only in VxDesign.
  readonly firstName?: string;
  readonly middleName?: string;
  readonly lastName?: string;
}
export const CandidateSchema: z.ZodSchema<Candidate> = z
  .object({
    id: CandidateIdSchema,
    name: z.string().min(1),
    partyIds: z.array(PartyIdSchema).optional(),
    isWriteIn: z.boolean().optional(),
    writeInIndex: z.number().int().nonnegative().optional(),
    firstName: z
      .string()
      .transform((s) => s.trim() || undefined)
      .optional(),
    middleName: z
      .string()
      .transform((s) => s.trim() || undefined)
      .optional(),
    lastName: z
      .string()
      .transform((s) => s.trim() || undefined)
      .optional(),
  })
  .refine(
    ({ id, isWriteIn }) => !!isWriteIn === id.startsWith('write-in'),
    `Non-write-in candidate IDs must not start with 'write-in'`
  );

export interface WriteInCandidate {
  readonly id: WriteInId;
  readonly name: string;
  readonly isWriteIn: true;
  readonly writeInIndex?: number;
  readonly partyIds?: readonly PartyId[];
}
export const WriteInCandidateSchema: z.ZodSchema<WriteInCandidate> = z.object({
  id: WriteInIdSchema,
  name: z.string().nonempty(),
  isWriteIn: z.literal(true),
  writeInIndex: z.number().int().nonnegative().optional(),
  partyIds: z.array(PartyIdSchema).optional(),
});

export type OptionalCandidate = Optional<Candidate>;
export const OptionalCandidateSchema: z.ZodSchema<OptionalCandidate> =
  CandidateSchema.optional();

// Contests
export type ContestId = Id;
export const ContestIdSchema: z.ZodSchema<ContestId> = IdSchema;

export interface ContestBase {
  readonly id: ContestId;
  readonly districtId: DistrictId;
  readonly title: string;
}

export const ContestBaseSchema = z.object({
  id: ContestIdSchema,
  districtId: DistrictIdSchema,
  title: z.string().nonempty(),
});
export interface CandidateContest extends ContestBase {
  readonly type: 'candidate';
  readonly seats: number;
  readonly candidates: readonly Candidate[];
  readonly allowWriteIns: boolean;
  readonly partyId?: PartyId;
  readonly termDescription?: string;
}
export const CandidateContestSchema: z.ZodSchema<CandidateContest> =
  ContestBaseSchema.extend({
    type: z.literal('candidate'),
    seats: z.number().int().positive(),
    candidates: z.array(CandidateSchema),
    allowWriteIns: z.boolean(),
    partyId: PartyIdSchema.optional(),
    termDescription: z.string().nonempty().optional(),
  }).check((ctx) => {
    const contest = ctx.value;
    for (const [index, id] of findDuplicateIds(contest.candidates)) {
      ctx.issues.push({
        code: 'custom',
        path: ['candidates', index, 'id'],
        message: `Duplicate candidate '${id}' found.`,
        input: contest,
      });
    }

    if (!contest.allowWriteIns) {
      if (contest.candidates.length === 0) {
        ctx.issues.push({
          code: 'custom',
          path: ['candidates'],
          message:
            'Contest must have at least one candidate or allow write-ins.',
          input: contest,
        });
      }
      for (const [index, candidate] of contest.candidates.entries()) {
        if (candidate.isWriteIn) {
          ctx.issues.push({
            code: 'custom',
            path: ['candidates', index, 'isWriteIn'],
            message: `Contest '${contest.id}' does not allow write-ins.`,
            input: contest,
          });
        }
      }
    } else {
      const writeInsCount = contest.candidates.filter(
        (c) => c.isWriteIn
      ).length;
      if (writeInsCount > 0 && writeInsCount !== contest.seats) {
        ctx.issues.push({
          code: 'custom',
          path: ['candidates'],
          message: `Contest has ${writeInsCount} write-in candidate(s), but ${contest.seats} seat(s) are available.`,
          input: contest,
        });
      }
    }
  });

export interface YesNoOption {
  readonly id: Id;
  readonly label: string;
}
export const YesNoOptionSchema: z.ZodSchema<YesNoOption> = z.object({
  id: IdSchema,
  label: z.string().nonempty(),
});

export interface YesNoContest extends ContestBase {
  readonly type: 'yesno';
  readonly description: string;
  /**
   * Ordered list of options (at least two). The first option is conventionally
   * "yes" and the second "no";
   */
  readonly options: readonly [YesNoOption, YesNoOption, ...YesNoOption[]];
}
export const YesNoContestSchema: z.ZodSchema<YesNoContest> =
  ContestBaseSchema.extend({
    type: z.literal('yesno'),
    description: z.string().nonempty(),
    options: z.array(YesNoOptionSchema).min(2) as unknown as z.ZodType<
      readonly [YesNoOption, YesNoOption, ...YesNoOption[]]
    >,
  });

export interface StraightPartyContest extends ContestBase {
  readonly type: 'straight-party';
  readonly optionIds: readonly PartyId[];
}
export const StraightPartyContestSchema: z.ZodSchema<StraightPartyContest> =
  ContestBaseSchema.extend({
    type: z.literal('straight-party'),
    optionIds: z.array(PartyIdSchema).nonempty(),
  });

/**
 * This can be placed wherever type narrowing is required, and also marks all
 * outstanding straight-party contest cases.
 */
export function straightPartyNotYetImplemented(): never {
  throw new Error('Straight party contests are not yet implemented');
}

export type Contest = CandidateContest | YesNoContest | StraightPartyContest;
export const ContestSchema: z.ZodSchema<Contest> = z.union([
  CandidateContestSchema,
  YesNoContestSchema,
  StraightPartyContestSchema,
]);

export const ContestsSchema = z.array(ContestSchema).check((ctx) => {
  const contests = ctx.value;
  for (const [index, id] of findDuplicateIds(contests)) {
    ctx.issues.push({
      code: 'custom',
      path: [index, 'id'],
      message: `Duplicate contest '${id}' found.`,
      input: contests,
    });
  }
  for (const [index, id] of findDuplicateIds(
    contests.flatMap((c) => (c.type === 'yesno' ? c.options : []))
  )) {
    ctx.issues.push({
      code: 'custom',
      path: [index, 'options', 'id'],
      message: `Duplicate yes/no contest option '${id}' found.`,
      input: contests,
    });
  }
});

// Election
export type ElectionId = string;
export const ElectionIdSchema: z.ZodSchema<ElectionId> = IdSchema;

export type PrecinctId = Id;
export const PrecinctIdSchema: z.ZodSchema<PrecinctId> = IdSchema;

export interface NhPrecinctSplitOptions {
  electionTitleOverride?: string;
  electionSealOverride?: string;
  clerkSignatureImage?: string; // This is also an override.
  clerkSignatureCaption?: string; // This is also an override.
}

export interface PrecinctWithoutSplits {
  districtIds: readonly DistrictId[];
  id: PrecinctId;
  name: string;
}
export interface PrecinctWithSplits {
  id: PrecinctId;
  name: string;
  splits: readonly PrecinctSplit[];
}

export type PrecinctSplitId = Id;

interface PrecinctSplitBase {
  id: PrecinctSplitId;
  districtIds: readonly DistrictId[];
  name: string;
}
export type PrecinctSplit = PrecinctSplitBase & NhPrecinctSplitOptions;

export type Precinct = PrecinctWithoutSplits | PrecinctWithSplits;

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}

export type PrecinctOrSplit =
  | { precinct: PrecinctWithoutSplits; split?: never }
  | { precinct: PrecinctWithSplits; split: PrecinctSplit };

export interface PrecinctOrSplitId {
  precinctId: PrecinctId;
  splitId?: Id;
}

const PrecinctWithoutSplitsSchema: z.ZodSchema<PrecinctWithoutSplits> =
  z.object({
    districtIds: z.array(DistrictIdSchema),
    id: PrecinctIdSchema,
    name: z.string().min(1),
  });

const NhPrecinctSplitOptionsSchema = z.object({
  electionTitleOverride: z.string().optional(),
  electionSealOverride: z.string().optional(),
  clerkSignatureImage: z.string().optional(),
  clerkSignatureCaption: z.string().optional(),
});

const PrecinctSplitBaseSchema = z.object({
  districtIds: z.array(DistrictIdSchema),
  id: IdSchema,
  name: z.string().min(1),
});

const PrecinctSplitSchema: z.ZodSchema<PrecinctSplit> =
  PrecinctSplitBaseSchema.merge(NhPrecinctSplitOptionsSchema);

const PrecinctWithSplitsSchema: z.ZodSchema<PrecinctWithSplits> = z.object({
  id: PrecinctIdSchema,
  name: z.string().min(1),
  splits: z.array(PrecinctSplitSchema),
});

export const PrecinctSchema: z.ZodSchema<Precinct> = z.union([
  PrecinctWithoutSplitsSchema,
  PrecinctWithSplitsSchema,
]);
export const PrecinctsSchema = z
  .array(PrecinctSchema)
  .nonempty()
  .check((ctx) => {
    const precincts = ctx.value;
    for (const [index, id] of findDuplicateIds(precincts)) {
      ctx.issues.push({
        code: 'custom',
        path: [index, 'id'],
        message: `Duplicate precinct '${id}' found.`,
        input: precincts,
      });
    }
  });

// Represents a bubble option that should be displayed for selection on a ballot.
export interface OrderedCandidateOption {
  id: CandidateId;
  partyIds?: readonly PartyId[];
}

export const OrderedCandidateOptionSchema: z.ZodSchema<OrderedCandidateOption> =
  z.object({
    id: CandidateIdSchema,
    partyIds: z.array(PartyIdSchema).optional(),
  });

export type BallotStyleId = string;
export const BallotStyleIdSchema = IdSchema;

export interface BallotStyle {
  readonly id: BallotStyleId;
  readonly groupId: BallotStyleGroupId;
  readonly precincts: readonly PrecinctId[];
  readonly districts: readonly DistrictId[];
  readonly partyId?: PartyId;
  readonly languages: readonly string[];
  readonly orderedCandidatesByContest?: Record<
    ContestId,
    OrderedCandidateOption[]
  >;
  /**
   * The grid positions (bubble centers and bounding boxes) of every contest and
   * option on this ballot style's HMPB, organized by sheet. Absent for ballot
   * styles that have not been laid out (e.g. BMD-only or draft elections).
   */
  readonly ballotPositions?: readonly SheetPositions[];
}

export type BallotStyleGroupId = string;
export const BallotStyleGroupIdSchema = IdSchema;
export interface BallotStyleGroup {
  readonly id: BallotStyleGroupId;
  readonly defaultLanguageBallotStyle: BallotStyle;
  readonly ballotStyles: readonly BallotStyle[];
  readonly precincts: readonly PrecinctId[];
  readonly districts: readonly DistrictId[];
  readonly orderedCandidatesByContest?: Record<
    ContestId,
    OrderedCandidateOption[]
  >;
  readonly partyId?: PartyId;
}

/**
 * A measurement in timing-mark grid units (relative to the timing mark grid,
 * where 1 unit is the distance between adjacent timing marks).
 */
export type GridUnit = number;

/** A point in timing-mark grid coordinates. */
export interface GridPoint {
  readonly row: GridUnit;
  readonly column: GridUnit;
}
export const GridPointSchema: z.ZodSchema<GridPoint> = z.object({
  row: z.number(),
  column: z.number(),
});

/** A rectangle in timing-mark grid coordinates. */
export interface GridRect {
  readonly row: GridUnit;
  readonly column: GridUnit;
  readonly width: GridUnit;
  readonly height: GridUnit;
}
export const GridRectSchema: z.ZodSchema<GridRect> = z.object({
  row: z.number(),
  column: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export interface OptionPosition {
  readonly type: 'option';
  /** Center of the bubble (target mark) for this option, in grid coordinates. */
  readonly bubbleCenter: GridPoint;
  /**
   * Bounding box of this option (in grid coordinates), used to crop/highlight
   * the option in the adjudication UI.
   */
  readonly bounds: GridRect;
  /**
   * Identifying information for the specific option this position represents.
   * For candidate options this maps to an OrderedCandidateOption; a
   * multi-endorsed candidate may have multiple positions for the same option id
   * but different parties.
   */
  readonly optionId: Id;
  readonly partyIds?: readonly PartyId[];
}
export const OptionPositionSchema: z.ZodSchema<OptionPosition> = z.object({
  type: z.literal('option'),
  bubbleCenter: GridPointSchema,
  bounds: GridRectSchema,
  optionId: IdSchema,
  partyIds: z.array(PartyIdSchema).optional(),
});

export interface WriteInPosition {
  readonly type: 'write-in';
  /** Center of the bubble (target mark) for this option, in grid coordinates. */
  readonly bubbleCenter: GridPoint;
  /** Bounding box of this option (in grid coordinates). */
  readonly bounds: GridRect;
  readonly writeInIndex: number;
  /**
   * The grid coordinates of the area of the ballot where the voter is expected
   * to write the write-in candidate name. We use this to detect unmarked
   * write-ins (when the voter wrote in a candidate name but didn't fill in the
   * bubble).
   */
  readonly writeInArea: GridRect;
}
export const WriteInPositionSchema: z.ZodSchema<WriteInPosition> = z.object({
  type: z.literal('write-in'),
  bubbleCenter: GridPointSchema,
  bounds: GridRectSchema,
  writeInIndex: z.number().int().nonnegative(),
  writeInArea: GridRectSchema,
});

export type ContestOptionPosition = OptionPosition | WriteInPosition;
export const ContestOptionPositionSchema: z.ZodSchema<ContestOptionPosition> =
  z.union([OptionPositionSchema, WriteInPositionSchema]);

export interface ContestPosition {
  readonly contestId: ContestId;
  /** Bounding box of the whole contest (in grid coordinates). */
  readonly bounds: GridRect;
  readonly options: readonly ContestOptionPosition[];
}
export const ContestPositionSchema: z.ZodSchema<ContestPosition> = z.object({
  contestId: ContestIdSchema,
  bounds: GridRectSchema,
  options: z.array(ContestOptionPositionSchema),
});

/**
 * The contest positions for a single sheet, as a `[front, back]` tuple.
 *
 * Mirrors `SheetOf<ContestPosition[]>`; inlined as a tuple to avoid a circular
 * import with hmpb.ts (which imports from this module).
 */
export type SheetPositions = readonly [
  front: readonly ContestPosition[],
  back: readonly ContestPosition[],
];
export const SheetPositionsSchema: z.ZodSchema<SheetPositions> = z.tuple([
  z.array(ContestPositionSchema),
  z.array(ContestPositionSchema),
]);

// GridPosition is the ballot interpreter's per-mark output type: it tags a
// scored bubble with the contest/option it represents and where the bubble sits
// on the timing-mark grid. It is NOT part of the election definition (ballot
// geometry now lives in `ballotPositions` above); it only describes interpreted
// marks, so it is kept here as the shared contract between the interpreter and
// its TypeScript consumers.
export interface GridPositionOption {
  readonly type: 'option';
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  /** X coordinate of the bubble center, relative to the timing mark grid. */
  readonly column: number;
  /** Y coordinate of the bubble center, relative to the timing mark grid. */
  readonly row: number;
  readonly contestId: ContestId;
  readonly optionId: Id;
  readonly partyIds?: readonly PartyId[];
}
export const GridPositionOptionSchema: z.ZodSchema<GridPositionOption> =
  z.object({
    type: z.literal('option'),
    sheetNumber: z.number().int().positive(),
    side: z.union([z.literal('front'), z.literal('back')]),
    column: z.number().nonnegative(),
    row: z.number().nonnegative(),
    contestId: ContestIdSchema,
    optionId: IdSchema,
    partyIds: z.array(PartyIdSchema).optional(),
  });

export interface GridPositionWriteIn {
  readonly type: 'write-in';
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  /** X coordinate of the bubble center, relative to the timing mark grid. */
  readonly column: number;
  /** Y coordinate of the bubble center, relative to the timing mark grid. */
  readonly row: number;
  readonly contestId: ContestId;
  readonly writeInIndex: number;
  /** Grid coordinates of the write-in area, used to detect unmarked write-ins. */
  readonly writeInArea: Rect;
}
export const GridPositionWriteInSchema: z.ZodSchema<GridPositionWriteIn> =
  z.object({
    type: z.literal('write-in'),
    sheetNumber: z.number().int().positive(),
    side: z.union([z.literal('front'), z.literal('back')]),
    column: z.number().nonnegative(),
    row: z.number().nonnegative(),
    contestId: ContestIdSchema,
    writeInIndex: z.number().int().nonnegative(),
    writeInArea: RectSchema,
  });

export type GridPosition = GridPositionOption | GridPositionWriteIn;
export const GridPositionSchema: z.ZodSchema<GridPosition> = z.union([
  GridPositionOptionSchema,
  GridPositionWriteInSchema,
]);

// Declared without an explicit `z.ZodSchema<BallotStyle>` annotation (using
// `satisfies` instead) so the inferred `ZodObject` type stays available for
// `.extend()` — software_versions.ts derives a v4.0 variant from it.
export const BallotStyleSchema = z.object({
  id: BallotStyleIdSchema,
  groupId: BallotStyleGroupIdSchema,
  precincts: z.array(PrecinctIdSchema),
  districts: z.array(DistrictIdSchema),
  partyId: PartyIdSchema.optional(),
  languages: z.array(z.string()),
  orderedCandidatesByContest: z
    .record(z.string(), z.array(OrderedCandidateOptionSchema))
    .optional(),
  ballotPositions: z.array(SheetPositionsSchema).optional(),
}) satisfies z.ZodType<BallotStyle>;
export const BallotStylesSchema = z
  .array(BallotStyleSchema)
  .nonempty()
  .check((ctx) => {
    const ballotStyles = ctx.value;
    for (const [index, id] of findDuplicateIds(ballotStyles)) {
      ctx.issues.push({
        code: 'custom',
        path: [index, 'id'],
        message: `Duplicate ballot style '${id}' found.`,
        input: ballotStyles,
      });
    }
  });

export type JurisdictionId = Id;
export const JurisdictionIdSchema: z.ZodSchema<JurisdictionId> = IdSchema;
export interface Jurisdiction {
  readonly id: JurisdictionId;
  readonly name: string;
}
export const JurisdictionSchema: z.ZodSchema<Jurisdiction> = z.object({
  id: IdSchema,
  name: z.string().nonempty(),
});

export enum HmpbBallotPaperSize {
  Letter = 'letter',
  Legal = 'legal',
  Custom17 = 'custom-8.5x17',
  Custom18 = 'custom-8.5x18',
  Custom19 = 'custom-8.5x19',
  Custom20 = 'custom-8.5x20',
  Custom22 = 'custom-8.5x22',
}
export const HmpbBallotPaperSizeSchema: z.ZodSchema<HmpbBallotPaperSize> =
  z.enum(HmpbBallotPaperSize);

export enum BmdBallotPaperSize {
  Vsap150Thermal = 'vsap-150-thermal',
}
export const BmdBallotPaperSizeSchema: z.ZodSchema<BmdBallotPaperSize> =
  z.enum(BmdBallotPaperSize);

export type BallotPaperSize = HmpbBallotPaperSize | BmdBallotPaperSize;

export interface BallotLayout {
  paperSize: HmpbBallotPaperSize;
  metadataEncoding: 'qr-code';
}
export const BallotLayoutSchema: z.ZodSchema<BallotLayout> = z.object({
  paperSize: HmpbBallotPaperSizeSchema,
  metadataEncoding: z.enum(['qr-code']),
});

// Hand-marked paper & adjudication
export enum AdjudicationReason {
  MarginalMark = 'MarginalMark',
  Overvote = 'Overvote',
  Undervote = 'Undervote',
  BlankBallot = 'BlankBallot',
  UnmarkedWriteIn = 'UnmarkedWriteIn',
  CrossoverVoting = 'CrossoverVoting',
}
export const AdjudicationReasonSchema: z.ZodSchema<AdjudicationReason> =
  z.enum(AdjudicationReason);
export interface Signature {
  image: string;
  caption: string;
}

export const SignatureSchema: z.ZodSchema<Signature> = z.object({
  image: z.string(),
  caption: z.string(),
});

export interface PollingPlace {
  id: Id;
  name: string;
  precincts: Record<PrecinctId, PollingPlacePrecinct>;
  type: PollingPlaceType;
}

/**
 * - `whole`: The polling place covers the whole precinct, including any and
 *   all splits.
 * - `partial`: The polling places only covers the specified splits.
 */
export type PollingPlacePrecinct =
  | { type: 'whole' }
  | { type: 'partial'; splitIds: string[] };

export type PollingPlaceType = (typeof POLLING_PLACE_TYPES)[number];

const POLLING_PLACE_TYPES = [
  'absentee',
  'early_voting',
  'election_day',
] as const;

export const PollingPlacePrecinctSchema: z.ZodSchema<PollingPlacePrecinct> =
  z.union([
    z.object({
      type: z.literal('whole'),
    }),
    z.object({
      type: z.literal('partial'),
      splitIds: z.array(z.string()),
    }),
  ]);

export const PollingPlaceSchema: z.ZodSchema<PollingPlace> = z.object({
  id: IdSchema,
  name: z.string(),
  precincts: z.record(z.string(), PollingPlacePrecinctSchema),
  type: z.enum(POLLING_PLACE_TYPES),
});

export const PollingPlacesSchema = z
  .array(PollingPlaceSchema)
  .nonempty()
  .check((ctx) => {
    const places = ctx.value;
    for (const [index, id] of findDuplicateIds(places)) {
      ctx.issues.push({
        code: 'custom',
        path: [index, 'id'],
        message: `Duplicate polling place '${id}' found.`,
        input: places,
      });
    }
  });

export const ELECTION_TYPES = ['general', 'primary'] as const;
export type ElectionType = (typeof ELECTION_TYPES)[number];
export const ElectionTypeSchema: z.ZodSchema<ElectionType> =
  z.enum(ELECTION_TYPES);

export interface Election {
  readonly ballotLayout: BallotLayout;
  readonly ballotStrings: UiStringsPackage;
  readonly ballotStyles: readonly BallotStyle[];
  readonly contests: readonly Contest[];
  readonly jurisdiction: Jurisdiction;
  readonly date: DateWithoutTime;
  readonly districts: readonly District[];
  readonly id: ElectionId;
  readonly parties: Parties;
  readonly pollingPlaces: readonly PollingPlace[];
  readonly precincts: readonly Precinct[];
  readonly seal: string;
  readonly signature?: Signature;
  readonly state: string;
  readonly title: string;
  readonly type: ElectionType;
  readonly additionalHashInput?: Record<string, unknown>;
}
export const ElectionSchema = z
  .object({
    ballotLayout: BallotLayoutSchema,
    ballotStrings: UiStringsPackageSchema,
    ballotStyles: BallotStylesSchema,
    contests: ContestsSchema,
    jurisdiction: JurisdictionSchema,
    date: DateWithoutTimeSchema,
    districts: DistrictsSchema,
    id: ElectionIdSchema,
    parties: PartiesSchema,
    pollingPlaces: PollingPlacesSchema,
    precincts: PrecinctsSchema,
    seal: z.string(),
    signature: SignatureSchema.optional(),
    state: z.string().nonempty(),
    title: z.string().nonempty(),
    type: ElectionTypeSchema,
    additionalHashInput: z.record(z.string(), z.any()).optional(),
  })
  .check((ctx) => {
    const election = ctx.value;
    for (const [
      ballotStyleIndex,
      { id, districts, precincts },
    ] of election.ballotStyles.entries()) {
      for (const [districtIndex, districtId] of districts.entries()) {
        if (!election.districts.some((d) => d.id === districtId)) {
          ctx.issues.push({
            code: 'custom',
            path: [
              'ballotStyles',
              ballotStyleIndex,
              'districts',
              districtIndex,
            ],
            message: `Ballot style '${id}' has district '${districtId}', but no such district is defined. Districts defined: [${election.districts
              .map((d) => d.id)
              .join(', ')}].`,
            input: election,
          });
        }
      }

      for (const [precinctIndex, precinctId] of precincts.entries()) {
        if (!election.precincts.some((p) => p.id === precinctId)) {
          ctx.issues.push({
            code: 'custom',
            path: [
              'ballotStyles',
              ballotStyleIndex,
              'precincts',
              precinctIndex,
            ],
            message: `Ballot style '${id}' has precinct '${precinctId}', but no such precinct is defined. Precincts defined: [${election.precincts
              .map((p) => p.id)
              .join(', ')}].`,
            input: election,
          });
        }
      }
    }

    for (const [
      ballotStyleIndex,
      ballotStyle,
    ] of election.ballotStyles.entries()) {
      if (ballotStyle.orderedCandidatesByContest) {
        for (const [contestId, orderedCandidates] of Object.entries(
          ballotStyle.orderedCandidatesByContest
        )) {
          const contest = election.contests.find((c) => c.id === contestId);
          if (!contest) {
            ctx.issues.push({
              code: 'custom',
              path: [
                'ballotStyles',
                ballotStyleIndex,
                'orderedCandidatesByContest',
                contestId,
              ],
              message: `Ballot style '${ballotStyle.id}' has ordered candidates for contest '${contestId}', but no such contest is defined.`,
              input: election,
            });
            continue;
          }
          if (contest.type === 'candidate') {
            for (const [candidateId, candidateOptions] of iter(
              orderedCandidates
            )
              .toMap(({ id }) => id)
              .entries()) {
              const candidate = contest.candidates.find(
                (c) => c.id === candidateId
              );
              if (!candidate) {
                ctx.issues.push({
                  code: 'custom',
                  path: [
                    'ballotStyles',
                    ballotStyleIndex,
                    'orderedCandidatesByContest',
                    contestId,
                    candidateId,
                  ],
                  message: `Ordered candidate '${candidateId}' in ballot style '${ballotStyle.id}' for contest '${contestId}' does not exist in that contest.`,
                  input: election,
                });
                continue;
              }
              const candidatePartyIds = candidate.partyIds
                ? [...candidate.partyIds].sort()
                : [];
              const orderedCandidatePartyIds = [...candidateOptions]
                .flatMap((oc) => oc.partyIds ?? [])
                .sort();
              if (
                JSON.stringify(candidatePartyIds) !==
                JSON.stringify(orderedCandidatePartyIds)
              ) {
                ctx.issues.push({
                  code: 'custom',
                  path: [
                    'ballotStyles',
                    ballotStyleIndex,
                    'orderedCandidatesByContest',
                    contestId,
                    candidateId,
                    'partyIds',
                  ],
                  message: `Ordered candidate '${candidateId}' has party IDs [${orderedCandidatePartyIds.join(
                    ', '
                  )}], but candidate in contest has party IDs [${candidatePartyIds.join(
                    ', '
                  )}].`,
                  input: election,
                });
              }
            }
          }
        }
      }
    }

    for (const [contestIndex, contest] of election.contests.entries()) {
      if (contest.type === 'candidate') {
        if (
          contest.partyId &&
          !election.parties.some(({ id }) => id === contest.partyId)
        ) {
          ctx.issues.push({
            code: 'custom',
            path: ['contests', contestIndex, 'partyId'],
            message: `Contest '${contest.id}' has party '${
              contest.partyId
            }', but no such party is defined. Parties defined: [${election.parties
              .map(({ id }) => id)
              .join(', ')}].`,
            input: election,
          });
        }

        for (const [
          candidateIndex,
          candidate,
        ] of contest.candidates.entries()) {
          for (const [i, partyId] of (candidate.partyIds ?? []).entries()) {
            if (!election.parties.some((p) => p.id === partyId)) {
              ctx.issues.push({
                code: 'custom',
                path: [
                  'contests',
                  contestIndex,
                  'candidates',
                  candidateIndex,
                  'partyIds',
                  i,
                ],
                message: `Candidate '${candidate.id}' in contest '${
                  contest.id
                }' has party '${partyId}', but no such party is defined. Parties defined: [${election.parties
                  .map(({ id }) => id)
                  .join(', ')}].`,
                input: election,
              });
            }
          }
        }
      }
    }

    if (election.type === 'primary') {
      const hasBallotStyleWithPartyId = election.ballotStyles.some(
        (bs) => bs.partyId
      );
      const hasBallotStyleWithoutPartyId = election.ballotStyles.some(
        (bs) => !bs.partyId
      );
      if (hasBallotStyleWithPartyId && hasBallotStyleWithoutPartyId) {
        ctx.issues.push({
          code: 'custom',
          path: ['ballotStyles'],
          message:
            'Primary election ballot styles must either all have a partyId (closed primary) or all omit partyId (combined ballot primary).',
          input: election,
        });
      }
    }
  }) satisfies z.ZodType<Election>;
export type OptionalElection = Optional<Election>;
export const OptionalElectionSchema: z.ZodSchema<OptionalElection> =
  ElectionSchema.optional();
export interface ElectionDefinition {
  election: Election;
  electionData: string;
  /**
   * A sha256 hash of {@link electionData}. This hash is encoded on ballots and
   * verified by tabulators to ensure that the ballots and the tabulators have
   * the same configuration, therefore preventing any tabulation errors due to
   * mismatched configurations.
   *
   * Note that the raw {@link electionData} string is hashed instead of the
   * parsed {@link election} object since canonicalizing the JSON in order to
   * hash it would be potentially insecure.
   */
  ballotHash: string;
}
export const ElectionDefinitionSchema: z.ZodSchema<ElectionDefinition> = z
  .object({
    election: ElectionSchema,
    electionData: z.string().nonempty(),
    ballotHash: Sha256Hash,
  })
  .check((ctx) => {
    const electionDefinition = ctx.value;
    const { electionData, ballotHash } = electionDefinition;
    const electionDataHash = sha256(electionData);
    if (electionDataHash !== ballotHash) {
      ctx.issues.push({
        code: 'custom',
        path: ['ballotHash'],
        message: `Election data hash '${electionDataHash}' does not match ballot hash '${ballotHash}'.`,
        input: electionDefinition,
      });
    }
  });
export type OptionalElectionDefinition = Optional<ElectionDefinition>;
export const OptionalElectionDefinitionSchema: z.ZodSchema<OptionalElectionDefinition> =
  ElectionDefinitionSchema.optional();

export const ELECTION_SERIALIZATION_FORMATS = ['vxf', 'cdf'] as const;
export type ElectionSerializationFormat =
  (typeof ELECTION_SERIALIZATION_FORMATS)[number];
export const ElectionSerializationFormatSchema: z.ZodSchema<ElectionSerializationFormat> =
  z.enum(ELECTION_SERIALIZATION_FORMATS);

export enum BallotType {
  Precinct = 'precinct',
  Absentee = 'absentee',
  Provisional = 'provisional',
}
export const BallotTypeSchema: z.ZodSchema<BallotType> = z.enum(BallotType);

// Updating this value is a breaking change.
export const BallotTypeMaximumValue = 2 ** 4 - 1;

export interface CandidateContestOption {
  type: CandidateContest['type'];
  id: CandidateId;
  contestId: CandidateContest['id'];
  isWriteIn: boolean;
  writeInIndex?: number;
}
export const CandidateContestOptionSchema: z.ZodSchema<CandidateContestOption> =
  z.object({
    type: z.literal('candidate'),
    id: CandidateIdSchema,
    contestId: ContestIdSchema,
    isWriteIn: z.boolean(),
    writeInIndex: z.number().nonnegative().optional(),
  });

export type YesNoContestOptionId = Id;
export const YesNoContestOptionIdSchema: z.ZodSchema<YesNoContestOptionId> =
  IdSchema;
export interface YesNoContestOption {
  type: YesNoContest['type'];
  id: YesNoContestOptionId;
  contestId: YesNoContest['id'];
}
export const YesNoContestOptionSchema: z.ZodSchema<YesNoContestOption> =
  z.object({
    type: z.literal('yesno'),
    id: YesNoContestOptionIdSchema,
    contestId: ContestIdSchema,
  });

export interface StraightPartyContestOption {
  type: StraightPartyContest['type'];
  id: PartyId;
  contestId: StraightPartyContest['id'];
}
export const StraightPartyContestOptionSchema: z.ZodSchema<StraightPartyContestOption> =
  z.object({
    type: z.literal('straight-party'),
    id: PartyIdSchema,
    contestId: ContestIdSchema,
  });

export type ContestOption =
  | CandidateContestOption
  | YesNoContestOption
  | StraightPartyContestOption;
export const ContestOptionSchema: z.ZodSchema<ContestOption> = z.union([
  CandidateContestOptionSchema,
  YesNoContestOptionSchema,
  StraightPartyContestOptionSchema,
]);

export type ContestOptionId = ContestOption['id'];
export const ContestOptionIdSchema: z.ZodSchema<ContestOptionId> = z.union([
  CandidateIdSchema,
  WriteInIdSchema,
  YesNoContestOptionIdSchema,
  PartyIdSchema,
]);

// Votes
export type CandidateVote = readonly Candidate[];
export const CandidateVoteSchema: z.ZodSchema<CandidateVote> =
  z.array(CandidateSchema);
export type YesNoVote = readonly YesNoContestOptionId[];
export const YesNoVoteSchema: z.ZodSchema<YesNoVote> = z.array(
  YesNoContestOptionIdSchema
);
export type StraightPartyVote = readonly PartyId[];
export const StraightPartyVoteSchema: z.ZodSchema<StraightPartyVote> =
  z.array(PartyIdSchema);

export type OptionalYesNoVote = Optional<YesNoVote>;
export const OptionalYesNoVoteSchema: z.ZodSchema<OptionalYesNoVote> =
  YesNoVoteSchema.optional();
export type Vote = CandidateVote | YesNoVote | StraightPartyVote;
export const VoteSchema: z.ZodSchema<Vote> = z.union([
  CandidateVoteSchema,
  YesNoVoteSchema,
  StraightPartyVoteSchema,
]);
export type OptionalVote = Optional<Vote>;
export const OptionalVoteSchema: z.ZodSchema<OptionalVote> =
  VoteSchema.optional();
export type VotesDict = Record<ContestId, Optional<Vote>>;
export const VotesDictSchema: z.ZodSchema<VotesDict> = z.record(
  z.string(),
  VoteSchema
);

export interface MarginalMarkAdjudicationReasonInfo {
  type: AdjudicationReason.MarginalMark;
  contestId: ContestId;
  optionId: ContestOptionId;
}
export const MarginalMarkAdjudicationReasonInfoSchema: z.ZodSchema<MarginalMarkAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.MarginalMark),
    contestId: ContestIdSchema,
    optionId: ContestOptionIdSchema,
  });

export interface OvervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Overvote;
  contestId: ContestId;
  optionIds: ReadonlyArray<ContestOption['id']>;
  expected: number;
}
export const OvervoteAdjudicationReasonInfoSchema: z.ZodSchema<OvervoteAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.Overvote),
    contestId: ContestIdSchema,
    optionIds: z.array(ContestOptionIdSchema),
    expected: z.number(),
  });

export interface UndervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Undervote;
  contestId: ContestId;
  optionIds: ReadonlyArray<ContestOption['id']>;
  expected: number;
}
export const UndervoteAdjudicationReasonInfoSchema: z.ZodSchema<UndervoteAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.Undervote),
    contestId: ContestIdSchema,
    optionIds: z.array(ContestOptionIdSchema),
    expected: z.number(),
  });

export interface BlankBallotAdjudicationReasonInfo {
  type: AdjudicationReason.BlankBallot;
}
export const BlankBallotAdjudicationReasonInfoSchema: z.ZodSchema<BlankBallotAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.BlankBallot),
  });

export interface CrossoverVotingAdjudicationReasonInfo {
  type: AdjudicationReason.CrossoverVoting;
}
export const CrossoverVotingAdjudicationReasonInfoSchema: z.ZodSchema<CrossoverVotingAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.CrossoverVoting),
  });

export type AdjudicationReasonInfo =
  | MarginalMarkAdjudicationReasonInfo
  | OvervoteAdjudicationReasonInfo
  | UndervoteAdjudicationReasonInfo
  | BlankBallotAdjudicationReasonInfo
  | CrossoverVotingAdjudicationReasonInfo;
export const AdjudicationReasonInfoSchema: z.ZodSchema<AdjudicationReasonInfo> =
  z.union([
    MarginalMarkAdjudicationReasonInfoSchema,
    OvervoteAdjudicationReasonInfoSchema,
    UndervoteAdjudicationReasonInfoSchema,
    BlankBallotAdjudicationReasonInfoSchema,
    CrossoverVotingAdjudicationReasonInfoSchema,
  ]);

export type BallotId = string;
export const BallotIdSchema = z
  .string()
  .nonempty()
  .refine(
    (ballotId) => !ballotId.startsWith('_'),
    'Ballot IDs must not start with an underscore'
  ) as unknown as z.ZodSchema<BallotId>;

export interface BallotMetadata {
  ballotHash: string; // a hexadecimal string
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  isTestMode: boolean;
  ballotType: BallotType;
}
export const BallotMetadataSchema = z.object({
  ballotHash: Sha256Hash,
  precinctId: PrecinctIdSchema,
  ballotStyleId: BallotStyleIdSchema,
  isTestMode: z.boolean(),
  ballotType: BallotTypeSchema,
}) satisfies z.ZodType<BallotMetadata>;

export interface HmpbBallotPageMetadata extends BallotMetadata {
  pageNumber: number;
  /**
   * Only used when SystemSettings.precinctScanEnableBallotAuditIds feature is enabled.
   */
  ballotAuditId?: BallotId;
}
export const HmpbBallotPageMetadataSchema = BallotMetadataSchema.extend({
  pageNumber: z.number(),
  ballotAuditId: BallotIdSchema.optional(),
}) satisfies z.ZodType<HmpbBallotPageMetadata>;

/**
 * Metadata for a single page of a BMD summary ballot.
 * Used when VxMark prints ballots that span multiple pages.
 */
export interface SummaryBallotPageMetadata extends BallotMetadata {
  pageNumber: number;
  totalPages: number;
  /**
   * Required for multi-page BMD ballots to correlate pages during scanning.
   */
  ballotAuditId: BallotId;
  /**
   * IDs of contests whose votes are encoded on this page.
   */
  contestIds: ContestId[];
}
export const SummaryBallotPageMetadataSchema = BallotMetadataSchema.extend({
  pageNumber: z.number(),
  totalPages: z.number(),
  ballotAuditId: BallotIdSchema,
  contestIds: z.array(ContestIdSchema),
}) satisfies z.ZodType<SummaryBallotPageMetadata>;

export interface TargetShape {
  bounds: Rect;
  inner: Rect;
}
export const TargetShapeSchema: z.ZodSchema<TargetShape> = z.object({
  bounds: RectSchema,
  inner: RectSchema,
});

export interface BallotCandidateTargetMark {
  type: CandidateContest['type'];
  /** The area of the detected bubble. */
  bounds: Rect;
  contestId: ContestId;
  target: TargetShape;
  optionId: CandidateId | WriteInId;
  score: number;
  /**
   * How far away `bounds` was from where it was expected. Thus, the expected
   * bounds is `bounds - scoredOffset`.
   */
  scoredOffset: Offset;
}
export const BallotCandidateTargetMarkSchema: z.ZodSchema<BallotCandidateTargetMark> =
  z.object({
    type: z.literal('candidate'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: z.union([CandidateIdSchema, WriteInIdSchema]),
    score: z.number().min(0).max(1),
    scoredOffset: OffsetSchema,
  });

export interface BallotYesNoTargetMark {
  type: YesNoContest['type'];
  /** The area of the detected bubble. */
  bounds: Rect;
  contestId: ContestId;
  target: TargetShape;
  optionId: YesNoContestOptionId;
  score: number;
  /**
   * How far away `bounds` was from where it was expected. Thus, the expected
   * bounds is `bounds - scoredOffset`.
   */
  scoredOffset: Offset;
}
export const BallotYesNoTargetMarkSchema: z.ZodSchema<BallotYesNoTargetMark> =
  z.object({
    type: z.literal('yesno'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: YesNoContestOptionIdSchema,
    score: z.number(),
    scoredOffset: OffsetSchema,
  });

export interface BallotStraightPartyTargetMark {
  type: StraightPartyContest['type'];
  /** The area of the detected bubble. */
  bounds: Rect;
  contestId: ContestId;
  target: TargetShape;
  optionId: PartyId;
  score: number;
  /**
   * How far away `bounds` was from where it was expected. Thus, the expected
   * bounds is `bounds - scoredOffset`.
   */
  scoredOffset: Offset;
}
export const BallotStraightPartyTargetMarkSchema: z.ZodSchema<BallotStraightPartyTargetMark> =
  z.object({
    type: z.literal('straight-party'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: PartyIdSchema,
    score: z.number(),
    scoredOffset: OffsetSchema,
  });

export type BallotTargetMark =
  | BallotCandidateTargetMark
  | BallotYesNoTargetMark
  | BallotStraightPartyTargetMark;
export const BallotTargetMarkSchema: z.ZodSchema<BallotTargetMark> = z.union([
  BallotCandidateTargetMarkSchema,
  BallotYesNoTargetMarkSchema,
  BallotStraightPartyTargetMarkSchema,
]);

export type BallotMark = BallotTargetMark;
export const BallotMarkSchema: z.ZodSchema<BallotMark> = BallotTargetMarkSchema;

export interface MarkInfo {
  marks: BallotMark[];
  ballotSize: Size;
}
export const MarkInfoSchema: z.ZodSchema<MarkInfo> = z.object({
  marks: z.array(BallotMarkSchema),
  ballotSize: SizeSchema,
});

export interface AdjudicationInfo {
  requiresAdjudication: boolean;
  enabledReasons: readonly AdjudicationReason[];
  enabledReasonInfos: readonly AdjudicationReasonInfo[];
  ignoredReasonInfos: readonly AdjudicationReasonInfo[];
}
export const AdjudicationInfoSchema: z.ZodSchema<AdjudicationInfo> = z.object({
  requiresAdjudication: z.boolean(),
  enabledReasons: z.array(AdjudicationReasonSchema),
  enabledReasonInfos: z.array(AdjudicationReasonInfoSchema),
  ignoredReasonInfos: z.array(AdjudicationReasonInfoSchema),
});

export type Side = 'front' | 'back';
export const SideSchema = z.union([z.literal('front'), z.literal('back')]);

export interface BatchInfo {
  id: string;
  batchNumber: number;
  label: string;
  startedAt: Iso8601Timestamp;
  endedAt?: Iso8601Timestamp;
  error?: string;
  count: number;
  ballotCastingMode?: BallotCastingMode;
  pollingPlaceId: string;
}

export const BallotCastingModeSchema = z.enum(['early_voting', 'election_day']);
export type BallotCastingMode = z.infer<typeof BallotCastingModeSchema>;

export const ScannerMachineTypeSchema = z.enum(['central', 'precinct']);
export type ScannerMachineType = z.infer<typeof ScannerMachineTypeSchema>;

export const BatchInfoSchema: z.ZodSchema<BatchInfo> = z.object({
  id: IdSchema,
  batchNumber: z.number().int().positive(),
  label: z.string(),
  startedAt: Iso8601TimestampSchema,
  endedAt: z.optional(Iso8601TimestampSchema),
  error: z.optional(z.string()),
  count: z.number().nonnegative(),
  ballotCastingMode: z.optional(BallotCastingModeSchema),
  pollingPlaceId: IdSchema,
});

export interface CompletedBallot {
  readonly ballotHash: string;
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
  readonly votes: VotesDict;
  readonly isTestMode: boolean;
  readonly ballotType: BallotType;
}
