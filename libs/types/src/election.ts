/* eslint-disable no-underscore-dangle */
import { createHash } from 'crypto';
import * as z from 'zod';
import { Iso8601Timestamp, Iso8601TimestampSchema } from './api';
import {
  Dictionary,
  ElectionHash,
  Id,
  IdSchema,
  Iso8601Date,
  NewType,
  Optional,
  safeParse,
  safeParseJson,
} from './generic';
import {
  Offset,
  OffsetSchema,
  Rect,
  RectSchema,
  Size,
  SizeSchema,
} from './geometry';
import { ok, Result } from './result';

// Generic
export type Translations = Record<string, Record<string, string> | undefined>;
export const TranslationsSchema: z.ZodSchema<Translations> = z.record(
  z.record(z.string())
);

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

export type PartyId = NewType<string, 'PartyId'>;
export const PartyIdSchema = (IdSchema as unknown) as z.ZodSchema<PartyId>;
export interface Party {
  readonly id: PartyId;
  readonly name: string;
  readonly fullName: string;
  readonly abbrev: string;
}
export const PartySchema: z.ZodSchema<Party> = z.object({
  _lang: TranslationsSchema.optional(),
  id: PartyIdSchema,
  name: z.string().nonempty(),
  fullName: z.string().nonempty(),
  abbrev: z.string().nonempty(),
});

export type Parties = readonly Party[];
export const PartiesSchema: z.ZodSchema<Parties> = z
  .array(PartySchema)
  .superRefine((parties, ctx) => {
    for (const [index, id] of findDuplicateIds(parties)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'id'],
        message: `Duplicate party '${id}' found.`,
      });
    }
  });

export type DistrictId = NewType<string, 'DistrictId'>;
export const DistrictIdSchema = (IdSchema as unknown) as z.ZodSchema<DistrictId>;
export interface District {
  readonly id: DistrictId;
  readonly name: string;
}
export const DistrictSchema: z.ZodSchema<District> = z.object({
  _lang: TranslationsSchema.optional(),
  id: DistrictIdSchema,
  name: z.string().nonempty(),
});
export const DistrictsSchema = z
  .array(DistrictSchema)
  .nonempty()
  .superRefine((districts, ctx) => {
    for (const [index, id] of findDuplicateIds(districts)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'id'],
        message: `Duplicate district '${id}' found.`,
      });
    }
  });

// Candidates
export type WriteInId =
  | `__write-in`
  | `__write-in-${string}`
  // TODO: Remove this in favor of `__write-in-${string}` or some other unified
  // format for BMD and HMPB write-in IDs.
  | `write-in__${string}`;
export const WriteInIdSchema = z
  .string()
  .nonempty()
  .refine(
    (id) => /^(__write-in(-.+)?|write-in__(.+))$/.test(id),
    `Write-In ID does not match expected format.`
  ) as z.ZodSchema<WriteInId>;
export type CandidateId = Id;
export const CandidateIdSchema: z.ZodSchema<CandidateId> = IdSchema;
export interface Candidate {
  readonly id: CandidateId | WriteInId;
  readonly name: string;
  readonly partyId?: PartyId;
  readonly isWriteIn?: boolean;
}
export const CandidateSchema: z.ZodSchema<Candidate> = z.object({
  _lang: TranslationsSchema.optional(),
  id: z.union([CandidateIdSchema, WriteInIdSchema]),
  name: z.string().nonempty(),
  partyId: PartyIdSchema.optional(),
  isWriteIn: z.boolean().optional(),
});

export interface WriteInCandidate {
  readonly id: WriteInId;
  readonly name: string;
  readonly isWriteIn: true;
  readonly partyId?: PartyId;
}
export const WriteInCandidateSchema: z.ZodSchema<WriteInCandidate> = z.object({
  _lang: TranslationsSchema.optional(),
  id: WriteInIdSchema,
  name: z.string().nonempty(),
  isWriteIn: z.literal(true),
  partyId: PartyIdSchema.optional(),
});

export const writeInCandidate: Candidate = {
  id: '__write-in',
  name: 'Write-In',
  isWriteIn: true,
};
export type OptionalCandidate = Optional<Candidate>;
export const OptionalCandidateSchema: z.ZodSchema<OptionalCandidate> = CandidateSchema.optional();

// Contests
export type ContestTypes = 'candidate' | 'yesno' | 'ms-either-neither';
export const ContestTypesSchema: z.ZodSchema<ContestTypes> = z.union([
  z.literal('candidate'),
  z.literal('yesno'),
  z.literal('ms-either-neither'),
]);
export type RotationType = 'candidateShiftByPrecinctIndex';
export interface Rotation {
  readonly type: RotationType;
}
export const RotationSchema: z.ZodSchema<Rotation> = z.object({
  type: z.literal('candidateShiftByPrecinctIndex'),
});
export type ContestId = Id;
export const ContestIdSchema: z.ZodSchema<ContestId> = IdSchema;
export interface Contest {
  readonly id: ContestId;
  readonly districtId: DistrictId;
  readonly partyId?: PartyId;
  readonly section: string;
  readonly title: string;
  readonly type: ContestTypes;
}
const ContestInternalSchema = z.object({
  _lang: TranslationsSchema.optional(),
  id: ContestIdSchema,
  districtId: DistrictIdSchema,
  partyId: PartyIdSchema.optional(),
  section: z.string().nonempty(),
  title: z.string().nonempty(),
  type: ContestTypesSchema,
});
export const ContestSchema: z.ZodSchema<Contest> = ContestInternalSchema;
export interface CandidateContest extends Contest {
  readonly type: 'candidate';
  readonly seats: number;
  readonly candidates: readonly Candidate[];
  readonly allowWriteIns: boolean;
  readonly rotation?: Rotation;
}
export const CandidateContestSchema: z.ZodSchema<CandidateContest> = ContestInternalSchema.merge(
  z.object({
    type: z.literal('candidate'),
    seats: z.number().int().positive(),
    candidates: z.array(CandidateSchema),
    allowWriteIns: z.boolean(),
    rotation: RotationSchema.optional(),
  })
).superRefine((contest, ctx) => {
  for (const [index, id] of findDuplicateIds(contest.candidates)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidates', index, 'id'],
      message: `Duplicate candidate '${id}' found.`,
    });
  }

  if (!contest.allowWriteIns) {
    for (const [index, candidate] of contest.candidates.entries()) {
      if (candidate.isWriteIn) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['candidates', index, 'isWriteIn'],
          message: `Contest '${contest.id}' does not allow write-ins.`,
        });
      }
    }
  } else {
    const writeInsCount = contest.candidates.filter((c) => c.isWriteIn).length;
    if (writeInsCount > 0 && writeInsCount !== contest.seats) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['candidates'],
        message: `Contest has ${writeInsCount} write-in candidate(s), but ${contest.seats} seat(s) are available.`,
      });
    }
  }
});

export type YesNoOptionId = Id;
export const YesNoOptionIdSchema: z.ZodSchema<YesNoOptionId> = IdSchema;
export interface YesNoOption {
  readonly id: YesNoOptionId;
  readonly label: string;
}
export const YesNoOptionSchema: z.ZodSchema<YesNoOption> = z.object({
  id: YesNoOptionIdSchema,
  label: z.string().nonempty(),
});

export interface YesNoContest extends Contest {
  readonly type: 'yesno';
  readonly description: string;
  readonly shortTitle?: string;
  readonly yesOption?: YesNoOption;
  readonly noOption?: YesNoOption;
}
export const YesNoContestSchema: z.ZodSchema<YesNoContest> = ContestInternalSchema.merge(
  z.object({
    type: z.literal('yesno'),
    description: z.string().nonempty(),
    shortTitle: z.string().nonempty().optional(),
    yesOption: YesNoOptionSchema.optional(),
    noOption: YesNoOptionSchema.optional(),
  })
);

export interface MsEitherNeitherContest extends Contest {
  readonly type: 'ms-either-neither';
  readonly eitherNeitherContestId: ContestId;
  readonly pickOneContestId: ContestId;
  readonly description: string;
  readonly eitherNeitherLabel: string;
  readonly pickOneLabel: string;
  readonly eitherOption: YesNoOption;
  readonly neitherOption: YesNoOption;
  readonly firstOption: YesNoOption;
  readonly secondOption: YesNoOption;
}
export const MsEitherNeitherContestSchema: z.ZodSchema<MsEitherNeitherContest> = ContestInternalSchema.merge(
  z.object({
    type: z.literal('ms-either-neither'),
    eitherNeitherContestId: ContestIdSchema,
    pickOneContestId: ContestIdSchema,
    description: z.string().nonempty(),
    eitherNeitherLabel: z.string().nonempty(),
    pickOneLabel: z.string().nonempty(),
    eitherOption: YesNoOptionSchema,
    neitherOption: YesNoOptionSchema,
    firstOption: YesNoOptionSchema,
    secondOption: YesNoOptionSchema,
  })
);

export type AnyContest =
  | CandidateContest
  | YesNoContest
  | MsEitherNeitherContest;
export const AnyContestSchema: z.ZodSchema<AnyContest> = z.union([
  CandidateContestSchema,
  YesNoContestSchema,
  MsEitherNeitherContestSchema,
]);

export type Contests = readonly AnyContest[];
export const ContestsSchema = z
  .array(AnyContestSchema)
  .superRefine((contests, ctx) => {
    for (const [index, id] of findDuplicateIds(contests)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'id'],
        message: `Duplicate contest '${id}' found.`,
      });
    }
  });

// Election
export type PrecinctId = Id;
export const PrecinctIdSchema: z.ZodSchema<PrecinctId> = IdSchema;
export interface Precinct {
  readonly id: PrecinctId;
  readonly name: string;
}
export const PrecinctSchema: z.ZodSchema<Precinct> = z.object({
  _lang: TranslationsSchema.optional(),
  id: PrecinctIdSchema,
  name: z.string().nonempty(),
});
export const PrecinctsSchema = z
  .array(PrecinctSchema)
  .nonempty()
  .superRefine((precincts, ctx) => {
    for (const [index, id] of findDuplicateIds(precincts)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'id'],
        message: `Duplicate precinct '${id}' found.`,
      });
    }
  });

export type BallotStyleId = Id;
export const BallotStyleIdSchema: z.ZodSchema<BallotStyleId> = IdSchema;
export interface BallotStyle {
  readonly id: BallotStyleId;
  readonly precincts: readonly PrecinctId[];
  readonly districts: readonly DistrictId[];
  readonly partyId?: PartyId;
}
export const BallotStyleSchema: z.ZodSchema<BallotStyle> = z.object({
  _lang: TranslationsSchema.optional(),
  id: BallotStyleIdSchema,
  precincts: z.array(PrecinctIdSchema),
  districts: z.array(DistrictIdSchema),
  partyId: PartyIdSchema.optional(),
});
export const BallotStylesSchema = z
  .array(BallotStyleSchema)
  .nonempty()
  .superRefine((ballotStyles, ctx) => {
    for (const [index, id] of findDuplicateIds(ballotStyles)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'id'],
        message: `Duplicate ballot style '${id}' found.`,
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
  _lang: TranslationsSchema.optional(),
  id: IdSchema,
  name: z.string().nonempty(),
});

export interface BallotLocale {
  readonly primary: string;
  readonly secondary?: string;
}
export const BallotLocaleSchema: z.ZodSchema<BallotLocale> = z.object({
  primary: z.string(),
  secondary: z.string().optional(),
});

export type BallotStrings = Record<string, string | Translations>;
export const BallotStringsSchema: z.ZodSchema<BallotStrings> = z.record(
  z.union([z.string(), TranslationsSchema])
);

export enum BallotPaperSize {
  Letter = 'letter',
  Legal = 'legal',
  Custom8Point5X17 = 'custom8.5x17',
}
export const BallotPaperSizeSchema: z.ZodSchema<BallotPaperSize> = z.nativeEnum(
  BallotPaperSize
);

export interface BallotLayout {
  paperSize: BallotPaperSize;
  layoutDensity?: number;
}
export const BallotLayoutSchema: z.ZodSchema<BallotLayout> = z.object({
  paperSize: BallotPaperSizeSchema,
  layoutDensity: z.number().min(0).max(2).optional(),
});

// Hand-marked paper & adjudication
export enum AdjudicationReason {
  UninterpretableBallot = 'UninterpretableBallot',
  MarginalMark = 'MarginalMark',
  Overvote = 'Overvote',
  Undervote = 'Undervote',
  WriteIn = 'WriteIn',
  UnmarkedWriteIn = 'UnmarkedWriteIn',
  BlankBallot = 'BlankBallot',
}
export const AdjudicationReasonSchema: z.ZodSchema<AdjudicationReason> = z.nativeEnum(
  AdjudicationReason
);

export interface MarkThresholds {
  readonly marginal: number;
  readonly definite: number;
  readonly writeInText?: number;
}
export const MarkThresholdsSchema: z.ZodSchema<MarkThresholds> = z
  .object({
    marginal: z.number().min(0).max(1),
    definite: z.number().min(0).max(1),
    writeInText: z.number().min(0).max(1).optional(),
  })
  .refine(
    ({ marginal, definite }) => marginal <= definite,
    'marginal mark threshold must be less than or equal to definite mark threshold'
  );

export interface GridPositionOption {
  readonly type: 'option';
  readonly side: 'front' | 'back';
  readonly column: number;
  readonly row: number;
  readonly contestId: ContestId;
  readonly optionId: Id;
}
export const GridPositionOptionSchema: z.ZodSchema<GridPositionOption> = z.object(
  {
    type: z.literal('option'),
    side: z.union([z.literal('front'), z.literal('back')]),
    column: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
    contestId: ContestIdSchema,
    optionId: IdSchema,
  }
);

export interface GridPositionWriteIn {
  readonly type: 'write-in';
  readonly side: 'front' | 'back';
  readonly column: number;
  readonly row: number;
  readonly contestId: ContestId;
  readonly writeInIndex: number;
}
export const GridPositionWriteInSchema: z.ZodSchema<GridPositionWriteIn> = z.object(
  {
    type: z.literal('write-in'),
    side: z.union([z.literal('front'), z.literal('back')]),
    column: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
    contestId: ContestIdSchema,
    writeInIndex: z.number().int().nonnegative(),
  }
);

export type GridPosition = GridPositionOption | GridPositionWriteIn;
export const GridPositionSchema: z.ZodSchema<GridPosition> = z.union([
  GridPositionOptionSchema,
  GridPositionWriteInSchema,
]);
export interface GridLayout {
  readonly precinctId: PrecinctId;
  readonly ballotStyleId: BallotStyleId;
  readonly columns: number;
  readonly rows: number;
  readonly gridPositions: readonly GridPosition[];
}
export const GridLayoutSchema: z.ZodSchema<GridLayout> = z.object({
  precinctId: PrecinctIdSchema,
  ballotStyleId: BallotStyleIdSchema,
  columns: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  gridPositions: z.array(GridPositionSchema),
});

export interface Election {
  readonly _lang?: Translations;
  /** @deprecated Use `precinctScanAdjudicationReasons` or `centralScanAdjudicationReasons` */
  readonly adjudicationReasons?: readonly AdjudicationReason[];
  readonly ballotLayout?: BallotLayout;
  readonly ballotStrings?: BallotStrings;
  readonly ballotStyles: readonly BallotStyle[];
  readonly centralScanAdjudicationReasons?: readonly AdjudicationReason[];
  readonly contests: Contests;
  readonly gridLayouts?: readonly GridLayout[];
  readonly county: County;
  readonly date: string;
  readonly districts: readonly District[];
  readonly markThresholds?: MarkThresholds;
  readonly parties: Parties;
  readonly precinctScanAdjudicationReasons?: readonly AdjudicationReason[];
  readonly precincts: readonly Precinct[];
  readonly seal?: string;
  // TODO: Rename to `sealUrl` per GTS naming standard.
  // For backward-compatibility, we're keeping this invalid name for now.
  // eslint-disable-next-line vx/gts-identifiers
  readonly sealURL?: string;
  readonly state: string;
  readonly title: string;
}
export const ElectionSchema: z.ZodSchema<Election> = z
  .object({
    _lang: TranslationsSchema.optional(),
    adjudicationReasons: z
      .array(z.lazy(() => AdjudicationReasonSchema))
      .optional(),
    ballotLayout: BallotLayoutSchema.optional(),
    ballotStrings: z
      .record(z.union([z.string(), TranslationsSchema]))
      .optional(),
    ballotStyles: BallotStylesSchema,
    centralScanAdjudicationReasons: z
      .array(z.lazy(() => AdjudicationReasonSchema))
      .optional(),
    contests: ContestsSchema,
    gridLayouts: z.array(GridLayoutSchema).optional(),
    county: CountySchema,
    date: Iso8601Date,
    districts: DistrictsSchema,
    markThresholds: z.lazy(() => MarkThresholdsSchema).optional(),
    parties: PartiesSchema,
    precinctScanAdjudicationReasons: z
      .array(z.lazy(() => AdjudicationReasonSchema))
      .optional(),
    precincts: PrecinctsSchema,
    seal: z.string().nonempty().optional(),
    // TODO: Rename to `sealUrl` per GTS naming standard.
    // For backward-compatibility, we're keeping this invalid name for now.
    // eslint-disable-next-line vx/gts-identifiers
    sealURL: z.string().nonempty().optional(),
    state: z.string().nonempty(),
    title: z.string().nonempty(),
  })
  .superRefine((election, ctx) => {
    if (election.adjudicationReasons) {
      if (election.centralScanAdjudicationReasons) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['adjudicationReasons'],
          message: `Deprecated 'adjudicationReasons' provided while also providing 'centralScanAdjudicationReasons'.`,
        });
      }

      if (election.precinctScanAdjudicationReasons) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['adjudicationReasons'],
          message: `Deprecated 'adjudicationReasons' provided while also providing 'precinctScanAdjudicationReasons'.`,
        });
      }
    }

    for (const [
      ballotStyleIndex,
      { id, districts, precincts },
    ] of election.ballotStyles.entries()) {
      for (const [districtIndex, districtId] of districts.entries()) {
        if (!election.districts.some((d) => d.id === districtId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'ballotStyles',
              ballotStyleIndex,
              'districts',
              districtIndex,
            ],
            message: `Ballot style '${id}' has district '${districtId}', but no such district is defined. Districts defined: [${election.districts
              .map((d) => d.id)
              .join(', ')}].`,
          });
        }
      }

      for (const [precinctIndex, precinctId] of precincts.entries()) {
        if (!election.precincts.some((p) => p.id === precinctId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'ballotStyles',
              ballotStyleIndex,
              'precincts',
              precinctIndex,
            ],
            message: `Ballot style '${id}' has precinct '${precinctId}', but no such precinct is defined. Precincts defined: [${election.precincts
              .map((p) => p.id)
              .join(', ')}].`,
          });
        }
      }
    }

    for (const [contestIndex, contest] of election.contests.entries()) {
      if (contest.type === 'candidate') {
        if (
          contest.partyId &&
          !election.parties.some(({ id }) => id === contest.partyId)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['contests', contestIndex, 'partyId'],
            message: `Contest '${contest.id}' has party '${
              contest.partyId
            }', but no such party is defined. Parties defined: [${election.parties
              .map(({ id }) => id)
              .join(', ')}].`,
          });
        }

        for (const [
          candidateIndex,
          candidate,
        ] of contest.candidates.entries()) {
          if (
            candidate.partyId &&
            !election.parties.some(({ id }) => id === candidate.partyId)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [
                'contests',
                contestIndex,
                'candidates',
                candidateIndex,
                'partyId',
              ],
              message: `Candidate '${candidate.id}' in contest '${
                contest.id
              }' has party '${
                candidate.partyId
              }', but no such party is defined. Parties defined: [${election.parties
                .map(({ id }) => id)
                .join(', ')}].`,
            });
          }
        }
      }
    }
  })
  /**
   * Support loading election definitions that don't specify central/precinct
   * for adjudication by assuming it's the same for both.
   */
  .transform((election) => {
    if (
      election.adjudicationReasons &&
      !election.centralScanAdjudicationReasons &&
      !election.precinctScanAdjudicationReasons
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { adjudicationReasons: _adjudicationReasons, ...rest } = election;
      return {
        ...rest,
        centralScanAdjudicationReasons: election.adjudicationReasons,
        precinctScanAdjudicationReasons: election.adjudicationReasons,
      };
    }

    return election;
  });
export type OptionalElection = Optional<Election>;
export const OptionalElectionSchema: z.ZodSchema<OptionalElection> = ElectionSchema.optional();
export interface ElectionDefinition {
  election: Election;
  electionData: string;
  electionHash: string;
}
export const ElectionDefinitionSchema: z.ZodSchema<ElectionDefinition> = z.object(
  {
    election: ElectionSchema,
    electionData: z.string().nonempty(),
    electionHash: ElectionHash,
  }
);
export type OptionalElectionDefinition = Optional<ElectionDefinition>;
export const OptionalElectionDefinitionSchema: z.ZodSchema<OptionalElectionDefinition> = ElectionDefinitionSchema.optional();

// Votes
export type CandidateVote = readonly Candidate[];
export const CandidateVoteSchema: z.ZodSchema<CandidateVote> = z.array(
  CandidateSchema
);
export type YesNoVote =
  | readonly ['yes']
  | readonly ['no']
  | readonly ['yes', 'no']
  | readonly ['no', 'yes']
  | readonly [];
export type YesOrNo = Exclude<YesNoVote[0] | YesNoVote[1], undefined>;
export const YesNoVoteSchema: z.ZodSchema<YesNoVote> = z.union([
  z.tuple([z.literal('yes')]),
  z.tuple([z.literal('no')]),
  z.tuple([z.literal('yes'), z.literal('no')]),
  z.tuple([z.literal('no'), z.literal('yes')]),
  z.tuple([]),
]);
export type OptionalYesNoVote = Optional<YesNoVote>;
export const OptionalYesNoVoteSchema: z.ZodSchema<OptionalYesNoVote> = YesNoVoteSchema.optional();
export type Vote = CandidateVote | YesNoVote;
export const VoteSchema: z.ZodSchema<Vote> = z.union([
  CandidateVoteSchema,
  YesNoVoteSchema,
]);
export type OptionalVote = Optional<Vote>;
export const OptionalVoteSchema: z.ZodSchema<OptionalVote> = VoteSchema.optional();
export type VotesDict = Dictionary<Vote>;
export const VotesDictSchema: z.ZodSchema<VotesDict> = z.record(VoteSchema);

export enum BallotType {
  Standard = 0,
  Absentee = 1,
  Provisional = 2,
}
export const BallotTypeSchema: z.ZodSchema<BallotType> = z.nativeEnum(
  BallotType
);

// Updating this value is a breaking change.
export const BallotTypeMaximumValue = 2 ** 4 - 1;

export interface CandidateContestOption {
  type: CandidateContest['type'];
  id: CandidateId;
  contestId: CandidateContest['id'];
  name: Candidate['name'];
  isWriteIn: boolean;
  optionIndex: number;
}
export const CandidateContestOptionSchema: z.ZodSchema<CandidateContestOption> = z.object(
  {
    type: z.literal('candidate'),
    id: CandidateIdSchema,
    contestId: ContestIdSchema,
    name: z.string(),
    isWriteIn: z.boolean(),
    optionIndex: z.number().nonnegative(),
  }
);

export type YesNoContestOptionId = Exclude<
  YesNoVote[0] | YesNoVote[1],
  undefined
>;
export const YesNoContestOptionIdSchema: z.ZodSchema<YesNoContestOptionId> = z.union(
  [z.literal('yes'), z.literal('no')]
);
export interface YesNoContestOption {
  type: YesNoContest['type'];
  id: YesNoContestOptionId;
  contestId: YesNoContest['id'];
  name: string;
  optionIndex: number;
}
export const YesNoContestOptionSchema: z.ZodSchema<YesNoContestOption> = z.object(
  {
    type: z.literal('yesno'),
    id: z.union([z.literal('yes'), z.literal('no')]),
    contestId: ContestIdSchema,
    name: z.string(),
    optionIndex: z.number().nonnegative(),
  }
);

export type MsEitherNeitherContestOptionId =
  | MsEitherNeitherContest['eitherOption']['id']
  | MsEitherNeitherContest['neitherOption']['id']
  | MsEitherNeitherContest['firstOption']['id']
  | MsEitherNeitherContest['secondOption']['id'];
export const MsEitherNeitherContestOptionIdSchema: z.ZodSchema<MsEitherNeitherContestOptionId> = YesNoOptionIdSchema;

export interface MsEitherNeitherContestOption {
  type: MsEitherNeitherContest['type'];
  id: MsEitherNeitherContestOptionId;
  contestId:
    | MsEitherNeitherContest['eitherNeitherContestId']
    | MsEitherNeitherContest['pickOneContestId'];
  name: string;
  optionIndex: number;
}
export const MsEitherNeitherContestOptionSchema: z.ZodSchema<MsEitherNeitherContestOption> = z.object(
  {
    type: z.literal('ms-either-neither'),
    id: MsEitherNeitherContestOptionIdSchema,
    contestId: ContestIdSchema,
    name: z.string(),
    optionIndex: z.number().nonnegative(),
  }
);

export type ContestOption =
  | CandidateContestOption
  | YesNoContestOption
  | MsEitherNeitherContestOption;
export const ContestOption: z.ZodSchema<ContestOption> = z.union([
  CandidateContestOptionSchema,
  YesNoContestOptionSchema,
  MsEitherNeitherContestOptionSchema,
]);

export type ContestOptionId = ContestOption['id'];
export const ContestOptionIdSchema: z.ZodSchema<ContestOptionId> = z.union([
  CandidateIdSchema,
  WriteInIdSchema,
  YesNoContestOptionIdSchema,
  YesNoOptionIdSchema,
]);

export interface UninterpretableBallotAdjudicationReasonInfo {
  type: AdjudicationReason.UninterpretableBallot;
}
export const UninterpretableBallotAdjudicationReasonInfoSchema: z.ZodSchema<UninterpretableBallotAdjudicationReasonInfo> = z.object(
  {
    type: z.literal(AdjudicationReason.UninterpretableBallot),
  }
);

export interface MarginalMarkAdjudicationReasonInfo {
  type: AdjudicationReason.MarginalMark;
  contestId: ContestId;
  optionId: ContestOptionId;
  optionIndex: number;
}
export const MarginalMarkAdjudicationReasonInfoSchema: z.ZodSchema<MarginalMarkAdjudicationReasonInfo> = z.object(
  {
    type: z.literal(AdjudicationReason.MarginalMark),
    contestId: ContestIdSchema,
    optionId: ContestOptionIdSchema,
    optionIndex: z.number(),
  }
);

export interface OvervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Overvote;
  contestId: ContestId;
  optionIds: ReadonlyArray<ContestOption['id']>;
  optionIndexes: readonly number[];
  expected: number;
}
export const OvervoteAdjudicationReasonInfoSchema: z.ZodSchema<OvervoteAdjudicationReasonInfo> = z.object(
  {
    type: z.literal(AdjudicationReason.Overvote),
    contestId: ContestIdSchema,
    optionIds: z.array(ContestOptionIdSchema),
    optionIndexes: z.array(z.number().nonnegative()),
    expected: z.number(),
  }
);

export interface UndervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Undervote;
  contestId: ContestId;
  optionIds: ReadonlyArray<ContestOption['id']>;
  optionIndexes: readonly number[];
  expected: number;
}
export const UndervoteAdjudicationReasonInfoSchema: z.ZodSchema<UndervoteAdjudicationReasonInfo> = z.object(
  {
    type: z.literal(AdjudicationReason.Undervote),
    contestId: ContestIdSchema,
    optionIds: z.array(ContestOptionIdSchema),
    optionIndexes: z.array(z.number().nonnegative()),
    expected: z.number(),
  }
);

export interface WriteInAdjudicationReasonInfo {
  type: AdjudicationReason.WriteIn;
  contestId: ContestId;
  optionId: ContestOptionId;
  optionIndex: number;
}
export const WriteInAdjudicationReasonInfoSchema: z.ZodSchema<WriteInAdjudicationReasonInfo> = z.object(
  {
    type: z.literal(AdjudicationReason.WriteIn),
    contestId: ContestIdSchema,
    optionId: WriteInIdSchema,
    optionIndex: z.number().nonnegative(),
  }
);

export interface UnmarkedWriteInAdjudicationReasonInfo {
  type: AdjudicationReason.UnmarkedWriteIn;
  contestId: ContestId;
  optionId: ContestOptionId;
  optionIndex: number;
}
export const UnmarkedWriteInAdjudicationReasonInfoSchema: z.ZodSchema<UnmarkedWriteInAdjudicationReasonInfo> = z.object(
  {
    type: z.literal(AdjudicationReason.UnmarkedWriteIn),
    contestId: ContestIdSchema,
    optionId: WriteInIdSchema,
    optionIndex: z.number().nonnegative(),
  }
);

export interface BlankBallotAdjudicationReasonInfo {
  type: AdjudicationReason.BlankBallot;
}
export const BlankBallotAdjudicationReasonInfoSchema: z.ZodSchema<BlankBallotAdjudicationReasonInfo> = z.object(
  {
    type: z.literal(AdjudicationReason.BlankBallot),
  }
);

export type AdjudicationReasonInfo =
  | UninterpretableBallotAdjudicationReasonInfo
  | MarginalMarkAdjudicationReasonInfo
  | OvervoteAdjudicationReasonInfo
  | UndervoteAdjudicationReasonInfo
  | WriteInAdjudicationReasonInfo
  | UnmarkedWriteInAdjudicationReasonInfo
  | BlankBallotAdjudicationReasonInfo;
export const AdjudicationReasonInfoSchema: z.ZodSchema<AdjudicationReasonInfo> = z.union(
  [
    UninterpretableBallotAdjudicationReasonInfoSchema,
    MarginalMarkAdjudicationReasonInfoSchema,
    OvervoteAdjudicationReasonInfoSchema,
    UndervoteAdjudicationReasonInfoSchema,
    WriteInAdjudicationReasonInfoSchema,
    UnmarkedWriteInAdjudicationReasonInfoSchema,
    BlankBallotAdjudicationReasonInfoSchema,
  ]
);

export type BallotId = NewType<string, 'BallotId'>;
export const BallotIdSchema = (z
  .string()
  .nonempty()
  .refine(
    (ballotId) => !ballotId.startsWith('_'),
    'Ballot IDs must not start with an underscore'
  ) as unknown) as z.ZodSchema<BallotId>;

export interface HmpbBallotPageMetadata {
  electionHash: string; // a hexadecimal string
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  locales: BallotLocale;
  pageNumber: number;
  isTestMode: boolean;
  ballotType: BallotType;
  ballotId?: BallotId;
}
export const HmpbBallotPageMetadataSchema: z.ZodSchema<HmpbBallotPageMetadata> = z.object(
  {
    electionHash: ElectionHash,
    precinctId: PrecinctIdSchema,
    ballotStyleId: BallotStyleIdSchema,
    locales: BallotLocaleSchema,
    pageNumber: z.number(),
    isTestMode: z.boolean(),
    ballotType: BallotTypeSchema,
    ballotId: BallotIdSchema.optional(),
  }
);

export type BallotMetadata = Omit<
  HmpbBallotPageMetadata,
  'pageNumber' | 'ballotId'
>;
export const BallotMetadataSchema: z.ZodSchema<BallotMetadata> = z.object({
  electionHash: ElectionHash,
  precinctId: PrecinctIdSchema,
  ballotStyleId: BallotStyleIdSchema,
  locales: BallotLocaleSchema,
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
  bounds: Rect;
  contestId: ContestId;
  target: TargetShape;
  optionId: CandidateId | WriteInId;
  score: number;
  scoredOffset: Offset;
  writeInTextScore?: number;
}
export const BallotCandidateTargetMarkSchema: z.ZodSchema<BallotCandidateTargetMark> = z.object(
  {
    type: z.literal('candidate'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: z.union([CandidateIdSchema, WriteInIdSchema]),
    score: z.number().min(0).max(1),
    scoredOffset: OffsetSchema,
    writeInTextScore: z.number().min(0).max(1).optional(),
  }
);

export interface BallotYesNoTargetMark {
  type: YesNoContest['type'];
  bounds: Rect;
  contestId: ContestId;
  target: TargetShape;
  optionId: 'yes' | 'no';
  score: number;
  scoredOffset: Offset;
}
export const BallotYesNoTargetMarkSchema: z.ZodSchema<BallotYesNoTargetMark> = z.object(
  {
    type: z.literal('yesno'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: z.union([z.literal('yes'), z.literal('no')]),
    score: z.number(),
    scoredOffset: OffsetSchema,
  }
);

export interface BallotMsEitherNeitherTargetMark {
  type: MsEitherNeitherContest['type'];
  bounds: Rect;
  contestId: ContestId;
  target: TargetShape;
  optionId: YesNoOptionId;
  score: number;
  scoredOffset: Offset;
}
export const BallotMsEitherNeitherTargetMarkSchema: z.ZodSchema<BallotMsEitherNeitherTargetMark> = z.object(
  {
    type: z.literal('ms-either-neither'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: YesNoOptionIdSchema,
    score: z.number(),
    scoredOffset: OffsetSchema,
  }
);

export type BallotTargetMark =
  | BallotCandidateTargetMark
  | BallotYesNoTargetMark
  | BallotMsEitherNeitherTargetMark;
export const BallotTargetMarkSchema: z.ZodSchema<BallotTargetMark> = z.union([
  BallotCandidateTargetMarkSchema,
  BallotYesNoTargetMarkSchema,
  BallotMsEitherNeitherTargetMarkSchema,
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

export interface BlankPage {
  type: 'BlankPage';
}
export const BlankPageSchema: z.ZodSchema<BlankPage> = z.object({
  type: z.literal('BlankPage'),
});

export interface InterpretedBmdPage {
  type: 'InterpretedBmdPage';
  ballotId?: BallotId;
  metadata: BallotMetadata;
  votes: VotesDict;
}
export const InterpretedBmdPageSchema: z.ZodSchema<InterpretedBmdPage> = z.object(
  {
    type: z.literal('InterpretedBmdPage'),
    ballotId: BallotIdSchema.optional(),
    metadata: BallotMetadataSchema,
    votes: VotesDictSchema,
  }
);

export interface InterpretedHmpbPage {
  type: 'InterpretedHmpbPage';
  ballotId?: BallotId;
  metadata: HmpbBallotPageMetadata;
  markInfo: MarkInfo;
  votes: VotesDict;
  adjudicationInfo: AdjudicationInfo;
}
export const InterpretedHmpbPageSchema: z.ZodSchema<InterpretedHmpbPage> = z.object(
  {
    type: z.literal('InterpretedHmpbPage'),
    ballotId: BallotIdSchema.optional(),
    metadata: HmpbBallotPageMetadataSchema,
    markInfo: MarkInfoSchema,
    votes: VotesDictSchema,
    adjudicationInfo: AdjudicationInfoSchema,
  }
);

export interface InvalidElectionHashPage {
  type: 'InvalidElectionHashPage';
  expectedElectionHash: string;
  actualElectionHash: string;
}
export const InvalidElectionHashPageSchema: z.ZodSchema<InvalidElectionHashPage> = z.object(
  {
    type: z.literal('InvalidElectionHashPage'),
    expectedElectionHash: z.string(),
    actualElectionHash: z.string(),
  }
);

export interface InvalidTestModePage {
  type: 'InvalidTestModePage';
  metadata: BallotMetadata | HmpbBallotPageMetadata;
}
export const InvalidTestModePageSchema: z.ZodSchema<InvalidTestModePage> = z.object(
  {
    type: z.literal('InvalidTestModePage'),
    metadata: z.union([BallotMetadataSchema, HmpbBallotPageMetadataSchema]),
  }
);

export interface InvalidPrecinctPage {
  type: 'InvalidPrecinctPage';
  metadata: BallotMetadata | HmpbBallotPageMetadata;
}
export const InvalidPrecinctPageSchema: z.ZodSchema<InvalidPrecinctPage> = z.object(
  {
    type: z.literal('InvalidPrecinctPage'),
    metadata: z.union([BallotMetadataSchema, HmpbBallotPageMetadataSchema]),
  }
);

export interface UninterpretedHmpbPage {
  type: 'UninterpretedHmpbPage';
  metadata: HmpbBallotPageMetadata;
}
export const UninterpretedHmpbPageSchema: z.ZodSchema<UninterpretedHmpbPage> = z.object(
  {
    type: z.literal('UninterpretedHmpbPage'),
    metadata: HmpbBallotPageMetadataSchema,
  }
);

export interface UnreadablePage {
  type: 'UnreadablePage';
  reason?: string;
}
export const UnreadablePageSchema: z.ZodSchema<UnreadablePage> = z.object({
  type: z.literal('UnreadablePage'),
  reason: z.string().optional(),
});

export interface ImageInfo {
  url: string;
}
export const ImageInfoSchema: z.ZodSchema<ImageInfo> = z.object({
  url: z.string(),
});

export type PageInterpretation =
  | BlankPage
  | InterpretedBmdPage
  | InterpretedHmpbPage
  | InvalidElectionHashPage
  | InvalidTestModePage
  | InvalidPrecinctPage
  | UninterpretedHmpbPage
  | UnreadablePage;
export const PageInterpretationSchema: z.ZodSchema<PageInterpretation> = z.union(
  [
    BlankPageSchema,
    InterpretedBmdPageSchema,
    InterpretedHmpbPageSchema,
    InvalidElectionHashPageSchema,
    InvalidTestModePageSchema,
    InvalidPrecinctPageSchema,
    UninterpretedHmpbPageSchema,
    UnreadablePageSchema,
  ]
);

export interface PageInterpretationWithFiles {
  originalFilename: string;
  normalizedFilename: string;
  interpretation: PageInterpretation;
}
export const PageInterpretationWithFilesSchema: z.ZodSchema<PageInterpretationWithFiles> = z.object(
  {
    originalFilename: z.string(),
    normalizedFilename: z.string(),
    interpretation: PageInterpretationSchema,
  }
);

export interface BallotPageInfo {
  image: ImageInfo;
  interpretation: PageInterpretation;
  adjudicationFinishedAt?: Iso8601Timestamp;
}
export const BallotPageInfoSchema: z.ZodSchema<BallotPageInfo> = z.object({
  image: ImageInfoSchema,
  interpretation: PageInterpretationSchema,
  adjudicationFinishedAt: Iso8601TimestampSchema.optional(),
});

export interface BallotSheetInfo {
  id: Id;
  front: BallotPageInfo;
  back: BallotPageInfo;
  adjudicationReason?: AdjudicationReason;
}
export const BallotSheetInfoSchema: z.ZodSchema<BallotSheetInfo> = z.object({
  id: IdSchema,
  front: BallotPageInfoSchema,
  back: BallotPageInfoSchema,
  adjudicationReason: AdjudicationReasonSchema.optional(),
});

export interface CompletedBallot {
  readonly electionHash: string;
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
  readonly ballotId?: BallotId;
  readonly votes: VotesDict;
  readonly isTestMode: boolean;
  readonly ballotType: BallotType;
}

// Smart Card Content
export type CardDataTypes = 'voter' | 'pollworker' | 'admin' | 'superadmin';
export const CardDataTypesSchema: z.ZodSchema<CardDataTypes> = z.union([
  z.literal('voter'),
  z.literal('pollworker'),
  z.literal('admin'),
  z.literal('superadmin'),
]);
export interface CardData {
  readonly t: CardDataTypes;
}
const CardDataInternalSchema = z.object({
  t: CardDataTypesSchema,
});
export const CardDataSchema: z.ZodSchema<CardData> = CardDataInternalSchema;

export interface VoterCardData extends CardData {
  readonly t: 'voter';
  /** Created date */
  readonly c: number;
  /** Ballot style ID */
  readonly bs: string;
  /** Precinct ID */
  readonly pr: string;
  /** Used (voided) */
  readonly uz?: number;
  /** Ballot printed date */
  readonly bp?: number;
  /** Updated date */
  readonly u?: number;
  /** Mark machine ID */
  readonly m?: string;
}
export const VoterCardDataSchema: z.ZodSchema<VoterCardData> = CardDataInternalSchema.extend(
  {
    t: z.literal('voter'),
    c: z.number(),
    bs: IdSchema,
    pr: IdSchema,
    uz: z.number().optional(),
    bp: z.number().optional(),
    u: z.number().optional(),
    m: IdSchema.optional(),
  }
);

export interface PollworkerCardData extends CardData {
  readonly t: 'pollworker';
  /** Election hash */
  readonly h: string;
}
export const PollworkerCardDataSchema: z.ZodSchema<PollworkerCardData> = CardDataInternalSchema.extend(
  {
    t: z.literal('pollworker'),
    h: ElectionHash,
  }
);

export interface AdminCardData extends CardData {
  readonly t: 'admin';
  /** Election hash */
  readonly h: string;
  /** Card Passcode */
  readonly p?: string;
}
export const AdminCardDataSchema: z.ZodSchema<AdminCardData> = CardDataInternalSchema.extend(
  {
    t: z.literal('admin'),
    h: ElectionHash,
    p: z.string().optional(),
  }
);

/**
 * Beginning of the SuperAdmin card schema. More will be added to this as we fully flesh out this role
 * This is a minimal implementation for the purposes of rebooting from usb.
 */
export interface SuperAdminCardData extends CardData {
  readonly t: 'superadmin';
}
export const SuperAdminCardDataSchema: z.ZodSchema<SuperAdminCardData> = CardDataInternalSchema.extend(
  {
    t: z.literal('superadmin'),
  }
);

export type AnyCardData =
  | VoterCardData
  | PollworkerCardData
  | AdminCardData
  | SuperAdminCardData;
export const AnyCardDataSchema: z.ZodSchema<AnyCardData> = z.union([
  VoterCardDataSchema,
  PollworkerCardDataSchema,
  AdminCardDataSchema,
  SuperAdminCardDataSchema,
]);

/**
 * Gets contests which belong to a ballot style in an election.
 */
export function getContests({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle;
  election: Election;
}): Contests {
  return election.contests.filter(
    (c) =>
      ballotStyle.districts.includes(c.districtId) &&
      ballotStyle.partyId === c.partyId
  );
}

/**
 * Get all MS either-neither contests.
 */
export function getEitherNeitherContests(
  contests: Contests
): MsEitherNeitherContest[] {
  return contests.filter(
    (c): c is MsEitherNeitherContest => c.type === 'ms-either-neither'
  );
}

export function expandEitherNeitherContests(
  contests: Contests
): Array<Exclude<AnyContest, MsEitherNeitherContest>> {
  return contests.flatMap((contest) =>
    contest.type !== 'ms-either-neither'
      ? [contest]
      : [
          {
            type: 'yesno',
            id: contest.eitherNeitherContestId,
            title: `${contest.title} – Either/Neither`,
            districtId: contest.districtId,
            section: contest.section,
            description: contest.description,
            yesOption: contest.eitherOption,
            noOption: contest.neitherOption,
            ...(contest.partyId ? { partyId: contest.partyId } : {}),
          },
          {
            type: 'yesno',
            id: contest.pickOneContestId,
            title: `${contest.title} – Pick One`,
            districtId: contest.districtId,
            section: contest.section,
            description: contest.description,
            yesOption: contest.firstOption,
            noOption: contest.secondOption,
            ...(contest.partyId ? { partyId: contest.partyId } : {}),
          },
        ]
  );
}

/**
 * Retrieves a precinct by id.
 */
export function getPrecinctById({
  election,
  precinctId,
}: {
  election: Election;
  precinctId: PrecinctId;
}): Precinct | undefined {
  return election.precincts.find((p) => p.id === precinctId);
}

/**
 * Retrieves a precinct index by precinct id.
 */
export function getPrecinctIndexById({
  election,
  precinctId,
}: {
  election: Election;
  precinctId: PrecinctId;
}): number {
  return election.precincts.findIndex((p) => p.id === precinctId);
}

/**
 * Retrieves a ballot style by id.
 */
export function getBallotStyle({
  ballotStyleId,
  election,
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): BallotStyle | undefined {
  return election.ballotStyles.find((bs) => bs.id === ballotStyleId);
}

/**
 * Retrieve a contest from a set of contests based on ID
 * special-cases Ms Either Neither contests
 */
export function findContest({
  contests,
  contestId,
}: {
  contests: Contests;
  contestId: ContestId;
}): AnyContest | undefined {
  return contests.find((c) =>
    c.type === 'ms-either-neither'
      ? c.eitherNeitherContestId === contestId ||
        c.pickOneContestId === contestId
      : c.id === contestId
  );
}

/**
 * Validates the votes for a given ballot style in a given election.
 *
 * @throws When an inconsistency is found.
 */
export function validateVotes({
  votes,
  ballotStyle,
  election,
}: {
  votes: VotesDict;
  ballotStyle: BallotStyle;
  election: Election;
}): void {
  const contests = getContests({ election, ballotStyle });

  for (const contestId of Object.getOwnPropertyNames(votes)) {
    const contest = findContest({ contests, contestId });

    if (!contest) {
      throw new Error(
        `found a vote with contest id ${JSON.stringify(
          contestId
        )}, but no such contest exists in ballot style ${
          ballotStyle.id
        } (expected one of ${contests.map((c) => c.id).join(', ')})`
      );
    }
  }
}

/**
 * @deprecated Does not support i18n. 'party.fullname` should be used instead.
 * Gets the adjective used to describe the political party for a primary
 * election, e.g. "Republican" or "Democratic".
 */
export function getPartyPrimaryAdjectiveFromBallotStyle({
  ballotStyleId,
  election,
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): string {
  const parts = /(\d+)(\w+)/i.exec(ballotStyleId);
  const abbrev = parts?.[2];
  const party = election.parties.find((p) => p.abbrev === abbrev);
  const name = party?.name;
  return (name === 'Democrat' && 'Democratic') || name || '';
}

/**
 * Gets the full name of the political party for a primary election,
 * e.g. "Republican Party" or "Democratic Party".
 */
export function getPartyFullNameFromBallotStyle({
  ballotStyleId,
  election,
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): string {
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  const party = election.parties.find((p) => p.id === ballotStyle?.partyId);
  return party?.fullName ?? '';
}

export function getDistrictIdsForPartyId(
  election: Election,
  partyId: PartyId
): DistrictId[] {
  return election.ballotStyles
    .filter((bs) => bs.partyId === partyId)
    .flatMap((bs) => bs.districts);
}

/**
 * Returns an array of party ids present in ballot styles in the given election.
 * In the case of a ballot style without a party the element "undefined" will be included
 * in the returned array.
 */
export function getPartyIdsInBallotStyles(
  election: Election
): Array<PartyId | undefined> {
  return Array.from(new Set(election.ballotStyles.map((bs) => bs.partyId)));
}

/**
 * Helper function to build a `VotesDict` more easily, primarily for testing.
 *
 * @param contests The contests the voter voted in, probably from `getContests`.
 * @param shorthand A mapping of contest id to "vote", where a vote can be a
 * `Vote`, the string id of a candidate, multiple string ids for candidates, or
 * just a `Candidate` by itself.
 *
 * @example
 *
 * // Vote by candidate id.
 * vote(contests, { president: 'boone-lian' })
 *
 * // Vote by yesno contest.
 * vote(contests, { 'question-a': 'yes' })
 *
 * // Multiple votes.
 * vote(contests, {
 *   president: 'boone-lian',
 *   'question-a': 'yes'
 * })
 *
 * // Multiple candidate selections.
 * vote(contests, {
 *   'city-council': ['rupp', 'davis']
 * })
 */
export function vote(
  contests: Contests,
  shorthand: {
    [key: string]: Vote | string | readonly string[] | Candidate;
  }
): VotesDict {
  return Object.getOwnPropertyNames(shorthand).reduce((result, contestId) => {
    const contest = findContest({ contests, contestId });

    if (!contest) {
      throw new Error(`unknown contest ${contestId}`);
    }

    const choice = shorthand[contestId];

    if (contest.type !== 'candidate') {
      return { ...result, [contestId]: choice };
    }
    if (Array.isArray(choice) && typeof choice[0] === 'string') {
      return {
        ...result,
        [contestId]: contest.candidates.filter((c) =>
          (choice as readonly string[]).includes(c.id)
        ),
      };
    }

    if (typeof choice === 'string') {
      return {
        ...result,
        [contestId]: [contest.candidates.find((c) => c.id === choice)],
      };
    }

    return {
      ...result,
      [contestId]: Array.isArray(choice) ? choice : [choice],
    };
  }, {});
}

export function isVotePresent(v?: Vote): boolean {
  return !!v && v.length > 0;
}

/**
 * Helper function to get array of locale codes used in election definition.
 */
export function getElectionLocales(
  election: Election,
  baseLocale = 'en-US'
): string[] {
  return election._lang
    ? [baseLocale, ...Object.keys(election._lang)]
    : [baseLocale];
}

function copyWithLocale<T>(value: T, locale: string): T;
function copyWithLocale<T>(value: readonly T[], locale: string): readonly T[];
function copyWithLocale<T>(
  value: T | readonly T[],
  locale: string
): T | readonly T[] {
  if (Array.isArray(value)) {
    return value.map(
      (element) => (copyWithLocale(element, locale) as unknown) as T
    );
  }

  if (typeof value === 'undefined') {
    return value;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const lang = '_lang' in record && (record._lang as Translations);

    if (!lang) {
      return value;
    }

    const stringsEntry = Object.entries(lang).find(
      ([key]) => key.toLowerCase() === locale.toLowerCase()
    );

    if (!stringsEntry || !stringsEntry[1]) {
      return value;
    }

    const strings = stringsEntry[1];
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(record)) {
      if (key === '_lang') {
        continue;
      }

      if (key in strings) {
        result[key] = strings[key];
      } else {
        result[key] = copyWithLocale(val, locale);
      }
    }

    return result as T;
  }

  return value;
}

/**
 * Copies an election definition preferring strings from the matching locale.
 */
export function withLocale(election: Election, locale: string): Election {
  return copyWithLocale(election, locale);
}

/**
 * Parses `value` as an `Election` encoded as a JSON string. Equivalent to
 * `safeParseJson(Election, value)`.
 */
export function safeParseElection(
  value: string
): Result<Election, z.ZodError | SyntaxError>;
/**
 * Parses `value` as an `Election` object. Equivalent to
 * `safeParse(Election, value)`.
 */
export function safeParseElection(value: unknown): Result<Election, z.ZodError>;
export function safeParseElection(
  value: unknown
): Result<Election, z.ZodError | SyntaxError> {
  if (typeof value === 'string') {
    return safeParseJson(value, ElectionSchema);
  }
  return safeParse(ElectionSchema, value);
}

/**
 * Parses `value` as a JSON `Election`, computing the election hash if the
 * result is `Ok`.
 */
export function safeParseElectionDefinition(
  value: string
): Result<ElectionDefinition, z.ZodError | SyntaxError> {
  const result = safeParseElection(value);
  return result.isErr()
    ? result
    : ok({
        election: result.ok(),
        electionData: value,
        electionHash: createHash('sha256').update(value).digest('hex'),
      });
}

/**
 * @deprecated use `safeParseElection(…)` instead
 */
export function parseElection(value: unknown): Election {
  const result = safeParseElection(value);

  if (result.isErr()) {
    throw result.err();
  }

  return result.ok();
}
