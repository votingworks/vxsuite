import { Optional, DateWithoutTime, iter } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { z } from 'zod/v4';
import {
  Dictionary,
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
  Outset,
  OutsetSchema,
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
export const PartyIdSchema = IdSchema as unknown as z.ZodSchema<PartyId>;
export const PartySchema = z.object({
  id: PartyIdSchema,
  name: z.string().nonempty(),
  fullName: z.string().nonempty(),
  abbrev: z.string().nonempty(),
});

export interface Party extends z.infer<typeof PartySchema> {
  readonly id: PartyId;
  readonly name: string;
  readonly fullName: string;
  readonly abbrev: string;
}

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
export const DistrictIdSchema = IdSchema as unknown as z.ZodSchema<DistrictId>;
export const DistrictSchema = z.object({
  id: DistrictIdSchema,
  name: z.string().nonempty(),
});

export interface District extends z.infer<typeof DistrictSchema> {
  readonly id: DistrictId;
  readonly name: string;
}
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
// Structured name properties are supported only in VxDesign.
export const CandidateSchema = z
  .object({
    id: CandidateIdSchema,
    name: z.string().min(1),
    partyIds: z.array(PartyIdSchema).readonly().optional(),
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

export interface Candidate extends z.infer<typeof CandidateSchema> {}

export const WriteInCandidateSchema = z.object({
  id: WriteInIdSchema,
  name: z.string().nonempty(),
  isWriteIn: z.literal(true),
  writeInIndex: z.number().int().nonnegative().optional(),
  partyIds: z.array(PartyIdSchema).readonly().optional(),
});

export interface WriteInCandidate
  extends z.infer<typeof WriteInCandidateSchema> {}

export type OptionalCandidate = Optional<Candidate>;
export const OptionalCandidateSchema: z.ZodSchema<OptionalCandidate> =
  CandidateSchema.optional();

// Contests
export type ContestTypes = 'candidate' | 'yesno';
export const ContestTypesSchema: z.ZodSchema<ContestTypes> = z.union([
  z.literal('candidate'),
  z.literal('yesno'),
]);
export type ContestId = Id;
export const ContestIdSchema: z.ZodSchema<ContestId> = IdSchema;
export interface Contest {
  readonly id: ContestId;
  readonly districtId: DistrictId;
  readonly title: string;
  readonly type: ContestTypes;
}

/**
 * Generic type-agnostic contest type, enabling common operations on canonical
 * {@link Contest}s and BMD-specific ms-either-neither contests.
 */
export type ContestLike = Pick<Contest, 'id' | 'districtId' | 'title'>;

const ContestInternalSchema = z.object({
  id: ContestIdSchema,
  districtId: DistrictIdSchema,
  title: z.string().nonempty(),
  type: ContestTypesSchema,
});
export const ContestSchema: z.ZodSchema<Contest> = ContestInternalSchema;
export interface CandidateContest extends Contest {
  readonly type: 'candidate';
  readonly seats: number;
  readonly candidates: readonly Candidate[];
  readonly allowWriteIns: boolean;
  readonly partyId?: PartyId;
  readonly termDescription?: string;
}
export const CandidateContestSchema: z.ZodSchema<CandidateContest> =
  ContestInternalSchema.merge(
    z.object({
      type: z.literal('candidate'),
      seats: z.number().int().positive(),
      candidates: z.array(CandidateSchema),
      allowWriteIns: z.boolean(),
      partyId: PartyIdSchema.optional(),
      termDescription: z.string().nonempty().optional(),
    })
  ).check((ctx) => {
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

export interface YesNoContest extends Contest {
  readonly type: 'yesno';
  readonly description: string;
  readonly yesOption: YesNoOption;
  readonly noOption: YesNoOption;
}
export const YesNoContestSchema: z.ZodSchema<YesNoContest> =
  ContestInternalSchema.merge(
    z.object({
      type: z.literal('yesno'),
      description: z.string().nonempty(),
      yesOption: YesNoOptionSchema,
      noOption: YesNoOptionSchema,
    })
  );

export type AnyContest = CandidateContest | YesNoContest;
export const AnyContestSchema: z.ZodSchema<AnyContest> = z.union([
  CandidateContestSchema,
  YesNoContestSchema,
]);

export type Contests = readonly AnyContest[];
export const ContestsSchema = z.array(AnyContestSchema).check((ctx) => {
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
    contests.flatMap((c) =>
      c.type === 'yesno' ? [c.yesOption, c.noOption] : []
    )
  )) {
    ctx.issues.push({
      code: 'custom',
      path: [index, 'yes/noOption', 'id'],
      message: `Duplicate yes/no contest option '${id}' found.`,
      input: contests,
    });
  }
});

// Election
export type ElectionId = string;
export const ElectionIdSchema: z.ZodSchema<ElectionId> =
  IdSchema as unknown as z.ZodSchema<ElectionId>;

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
export const BallotStyleIdSchema =
  IdSchema as unknown as z.ZodSchema<BallotStyleId>;

export interface BallotStyle {
  readonly id: BallotStyleId;
  readonly groupId: BallotStyleGroupId;
  readonly precincts: readonly PrecinctId[];
  readonly districts: readonly DistrictId[];
  readonly partyId?: PartyId;
  readonly languages?: readonly string[]; // TODO(kofi): Make required.
  readonly orderedCandidatesByContest?: Record<
    ContestId,
    OrderedCandidateOption[]
  >;
}

export type BallotStyleGroupId = string;
export const BallotStyleGroupIdSchema =
  IdSchema as unknown as z.ZodSchema<BallotStyleGroupId>;
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

export const BallotStyleSchema: z.ZodSchema<BallotStyle> = z.object({
  id: BallotStyleIdSchema,
  groupId: BallotStyleGroupIdSchema,
  precincts: z.array(PrecinctIdSchema),
  districts: z.array(DistrictIdSchema),
  partyId: PartyIdSchema.optional(),
  languages: z.array(z.string()).optional(),
  orderedCandidatesByContest: z
    .record(z.string(), z.array(OrderedCandidateOptionSchema))
    .optional(),
});
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

export type CountyId = Id;
export const CountyIdSchema: z.ZodSchema<CountyId> = IdSchema;
export interface County {
  readonly id: CountyId;
  readonly name: string;
}
export const CountySchema: z.ZodSchema<County> = z.object({
  id: IdSchema,
  name: z.string().nonempty(),
});

export enum HmpbBallotPaperSize {
  Letter = 'letter',
  Legal = 'legal',
  Custom17 = 'custom-8.5x17',
  Custom19 = 'custom-8.5x19',
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
  /**
   * @deprecated - this is no longer used, but is here to keep compatibility
   * with existing elections
   */
  UninterpretableBallot = 'UninterpretableBallot',
  MarginalMark = 'MarginalMark',
  Overvote = 'Overvote',
  Undervote = 'Undervote',
  BlankBallot = 'BlankBallot',
  UnmarkedWriteIn = 'UnmarkedWriteIn',
}
export const AdjudicationReasonSchema: z.ZodSchema<AdjudicationReason> =
  z.enum(AdjudicationReason);

export interface GridPositionOption {
  readonly type: 'option';
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  /**
   * X coordinate for the center of the bubble for this option, relative to the
   * timing mark grid.
   */
  readonly column: number;
  /**
   * Y coordinate for the center of the bubble for this option, relative to the
   * timing mark grid.
   */
  readonly row: number;
  readonly contestId: ContestId;

  /**
   * Identifying information for the specific option this grid position represents.
   * For candidate options this maps to a OrderedCandidateOption, a multi-endorsed candidate
   * may have multiple grid positions / ordered candidate options for the same candidate / option id
   * but different parties.
   */
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
  /**
   * X coordinate for the center of the bubble for this option, relative to the
   * timing mark grid.
   */
  readonly column: number;
  /**
   * Y coordinate for the center of the bubble for this option, relative to the
   * timing mark grid.
   */
  readonly row: number;
  readonly contestId: ContestId;
  readonly writeInIndex: number;
  /**
   * The absolute grid coordinates of the area of the ballot where the voter is
   * expected to write the write-in candidate name. We use this to detect
   * unmarked write-ins (when the voter written in a candidate name but didn't
   * fill in the bubble).
   */
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
export interface GridLayout {
  readonly ballotStyleId: BallotStyleId;
  /**
   * Area in timing mark units around a target mark (i.e. bubble) to consider
   * part of the option for that target mark. This is used to crop the ballot
   * image to show the write-in area for a given grid position.
   */
  readonly optionBoundsFromTargetMark: Outset;
  readonly gridPositions: readonly GridPosition[];
}
export const GridLayoutSchema: z.ZodSchema<GridLayout> = z.object({
  ballotStyleId: BallotStyleIdSchema,
  optionBoundsFromTargetMark: OutsetSchema,
  gridPositions: z.array(GridPositionSchema),
});

export interface Signature {
  image: string;
  caption: string;
}

export const SignatureSchema: z.ZodSchema<Signature> = z.object({
  image: z.string(),
  caption: z.string(),
});

export const ELECTION_TYPES = ['general', 'primary'] as const;
export type ElectionType = (typeof ELECTION_TYPES)[number];
const ElectionTypeSchema: z.ZodSchema<ElectionType> = z.enum(ELECTION_TYPES);

export interface Election {
  readonly ballotLayout: BallotLayout;
  readonly ballotStrings: UiStringsPackage;
  readonly ballotStyles: readonly BallotStyle[];
  readonly contests: Contests;
  readonly county: County;
  readonly date: DateWithoutTime;
  readonly districts: readonly District[];
  readonly gridLayouts?: readonly GridLayout[];
  readonly id: ElectionId;
  readonly parties: Parties;
  readonly precincts: readonly Precinct[];
  readonly seal: string;
  readonly signature?: Signature;
  readonly state: string;
  readonly title: string;
  readonly type: ElectionType;
  readonly additionalHashInput?: Record<string, unknown>;
}
export const ElectionSchema: z.ZodSchema<Election> = z
  .object({
    ballotLayout: BallotLayoutSchema,
    ballotStrings: UiStringsPackageSchema,
    ballotStyles: BallotStylesSchema,
    contests: ContestsSchema,
    gridLayouts: z.array(GridLayoutSchema).optional(),
    county: CountySchema,
    date: DateWithoutTimeSchema,
    districts: DistrictsSchema,
    id: ElectionIdSchema,
    parties: PartiesSchema,
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
  });
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
  name: Candidate['name'];
  isWriteIn: boolean;
  writeInIndex?: number;
}
export const CandidateContestOptionSchema: z.ZodSchema<CandidateContestOption> =
  z.object({
    type: z.literal('candidate'),
    id: CandidateIdSchema,
    contestId: ContestIdSchema,
    name: z.string(),
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
  name: string;
}
export const YesNoContestOptionSchema: z.ZodSchema<YesNoContestOption> =
  z.object({
    type: z.literal('yesno'),
    id: YesNoContestOptionIdSchema,
    contestId: ContestIdSchema,
    name: z.string(),
  });

export type ContestOption = CandidateContestOption | YesNoContestOption;
export const ContestOptionSchema: z.ZodSchema<ContestOption> = z.union([
  CandidateContestOptionSchema,
  YesNoContestOptionSchema,
]);

export type ContestOptionId = ContestOption['id'];
export const ContestOptionIdSchema: z.ZodSchema<ContestOptionId> = z.union([
  CandidateIdSchema,
  WriteInIdSchema,
  YesNoContestOptionIdSchema,
]);

// Votes
export type CandidateVote = readonly Candidate[];
export const CandidateVoteSchema: z.ZodSchema<CandidateVote> =
  z.array(CandidateSchema);
export type YesNoVote = readonly YesNoContestOptionId[];
export const YesNoVoteSchema: z.ZodSchema<YesNoVote> = z.array(
  YesNoContestOptionIdSchema
);

export type OptionalYesNoVote = Optional<YesNoVote>;
export const OptionalYesNoVoteSchema: z.ZodSchema<OptionalYesNoVote> =
  YesNoVoteSchema.optional();
export type Vote = CandidateVote | YesNoVote;
export const VoteSchema: z.ZodSchema<Vote> = z.union([
  CandidateVoteSchema,
  YesNoVoteSchema,
]);
export type OptionalVote = Optional<Vote>;
export const OptionalVoteSchema: z.ZodSchema<OptionalVote> =
  VoteSchema.optional();
export type VotesDict = Dictionary<Vote>;
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

export type AdjudicationReasonInfo =
  | MarginalMarkAdjudicationReasonInfo
  | OvervoteAdjudicationReasonInfo
  | UndervoteAdjudicationReasonInfo
  | BlankBallotAdjudicationReasonInfo;
export const AdjudicationReasonInfoSchema: z.ZodSchema<AdjudicationReasonInfo> =
  z.union([
    MarginalMarkAdjudicationReasonInfoSchema,
    OvervoteAdjudicationReasonInfoSchema,
    UndervoteAdjudicationReasonInfoSchema,
    BlankBallotAdjudicationReasonInfoSchema,
  ]);

export type BallotId = string;
export const BallotIdSchema = z
  .string()
  .nonempty()
  .refine(
    (ballotId) => !ballotId.startsWith('_'),
    'Ballot IDs must not start with an underscore'
  ) as unknown as z.ZodSchema<BallotId>;

export interface HmpbBallotPageMetadata {
  ballotHash: string; // a hexadecimal string
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  pageNumber: number;
  isTestMode: boolean;
  ballotType: BallotType;
  /**
   * Only used when SystemSettings.precinctScanEnableBallotAuditIds feature is enabled.
   */
  ballotAuditId?: BallotId;
}
export const HmpbBallotPageMetadataSchema: z.ZodSchema<HmpbBallotPageMetadata> =
  z.object({
    ballotHash: Sha256Hash,
    precinctId: PrecinctIdSchema,
    ballotStyleId: BallotStyleIdSchema,
    pageNumber: z.number(),
    isTestMode: z.boolean(),
    ballotType: BallotTypeSchema,
    ballotAuditId: BallotIdSchema.optional(),
  });

export type BallotMetadata = Omit<
  HmpbBallotPageMetadata,
  'pageNumber' | 'ballotAuditId'
>;
export const BallotMetadataSchema: z.ZodSchema<BallotMetadata> = z.object({
  ballotHash: Sha256Hash,
  precinctId: PrecinctIdSchema,
  ballotStyleId: BallotStyleIdSchema,
  isTestMode: z.boolean(),
  ballotType: BallotTypeSchema,
});

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

export type BallotTargetMark =
  | BallotCandidateTargetMark
  | BallotYesNoTargetMark;
export const BallotTargetMarkSchema: z.ZodSchema<BallotTargetMark> = z.union([
  BallotCandidateTargetMarkSchema,
  BallotYesNoTargetMarkSchema,
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

export interface AdjudicationStatus {
  adjudicated: number;
  remaining: number;
}

export const AdjudicationStatusSchema: z.ZodSchema<AdjudicationStatus> =
  z.object({
    adjudicated: z.number(),
    remaining: z.number(),
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
}

export const BatchInfoSchema: z.ZodSchema<BatchInfo> = z.object({
  id: IdSchema,
  batchNumber: z.number().int().positive(),
  label: z.string(),
  startedAt: Iso8601TimestampSchema,
  endedAt: z.optional(Iso8601TimestampSchema),
  error: z.optional(z.string()),
  count: z.number().nonnegative(),
});

export interface CompletedBallot {
  readonly ballotHash: string;
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
  readonly votes: VotesDict;
  readonly isTestMode: boolean;
  readonly ballotType: BallotType;
}
