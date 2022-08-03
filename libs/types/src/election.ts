/* eslint-disable no-underscore-dangle */
import { sha256 } from 'js-sha256';
import { DateTime } from 'luxon';
import * as z from 'zod';
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
export const PartyIdSchema = IdSchema as unknown as z.ZodSchema<PartyId>;
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
export const DistrictIdSchema = IdSchema as unknown as z.ZodSchema<DistrictId>;
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
}
export const CandidateSchema: z.ZodSchema<Candidate> = z
  .object({
    _lang: TranslationsSchema.optional(),
    id: CandidateIdSchema,
    name: z.string().nonempty(),
    partyIds: z.array(PartyIdSchema).optional(),
    isWriteIn: z.boolean().optional(),
    writeInIndex: z.number().int().nonnegative().optional(),
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
  readonly partyId?: PartyId;
  readonly partyIds?: readonly PartyId[];
}
export const WriteInCandidateSchema: z.ZodSchema<WriteInCandidate> = z.object({
  _lang: TranslationsSchema.optional(),
  id: WriteInIdSchema,
  name: z.string().nonempty(),
  isWriteIn: z.literal(true),
  writeInIndex: z.number().int().nonnegative().optional(),
  partyIds: z.array(PartyIdSchema).optional(),
});

export const writeInCandidate: Candidate = {
  id: 'write-in',
  name: 'Write-In',
  isWriteIn: true,
};
export type OptionalCandidate = Optional<Candidate>;
export const OptionalCandidateSchema: z.ZodSchema<OptionalCandidate> =
  CandidateSchema.optional();

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
export const CandidateContestSchema: z.ZodSchema<CandidateContest> =
  ContestInternalSchema.merge(
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
      const writeInsCount = contest.candidates.filter(
        (c) => c.isWriteIn
      ).length;
      if (writeInsCount > 0 && writeInsCount !== contest.seats) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['candidates'],
          message: `Contest has ${writeInsCount} write-in candidate(s), but ${contest.seats} seat(s) are available.`,
        });
      }
    }
  });

export type AdjudicationId = Id;
export const AdjudicationIdSchema: z.ZodSchema<AdjudicationId> = IdSchema;
export interface Adjudication {
  readonly id: AdjudicationId;
  readonly contestId: ContestId;
  readonly transcribedValue: string;
}

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
export const YesNoContestSchema: z.ZodSchema<YesNoContest> =
  ContestInternalSchema.merge(
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
export const MsEitherNeitherContestSchema: z.ZodSchema<MsEitherNeitherContest> =
  ContestInternalSchema.merge(
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
export const BallotPaperSizeSchema: z.ZodSchema<BallotPaperSize> =
  z.nativeEnum(BallotPaperSize);

/**
 * Specifies where the target mark appears in relation to the option text.
 */
export enum BallotTargetMarkPosition {
  Left = 'left',
  Right = 'right',
}

/**
 * Schema for {@link BallotTargetMarkPosition}.
 */
export const BallotTargetMarkPositionSchema: z.ZodSchema<BallotTargetMarkPosition> =
  z.nativeEnum(BallotTargetMarkPosition);

export interface BallotLayout {
  paperSize: BallotPaperSize;
  layoutDensity?: number;
  targetMarkPosition?: BallotTargetMarkPosition;
}
export const BallotLayoutSchema: z.ZodSchema<BallotLayout> = z.object({
  paperSize: BallotPaperSizeSchema,
  layoutDensity: z.number().min(0).max(2).optional(),
  targetMarkPosition: BallotTargetMarkPositionSchema.optional(),
});

// Hand-marked paper & adjudication
export enum AdjudicationReason {
  UninterpretableBallot = 'UninterpretableBallot',
  MarginalMark = 'MarginalMark',
  Overvote = 'Overvote',
  Undervote = 'Undervote',
  BlankBallot = 'BlankBallot',
}
export const AdjudicationReasonSchema: z.ZodSchema<AdjudicationReason> =
  z.nativeEnum(AdjudicationReason);

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
export const GridPositionOptionSchema: z.ZodSchema<GridPositionOption> =
  z.object({
    type: z.literal('option'),
    side: z.union([z.literal('front'), z.literal('back')]),
    column: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
    contestId: ContestIdSchema,
    optionId: IdSchema,
  });

export interface GridPositionWriteIn {
  readonly type: 'write-in';
  readonly side: 'front' | 'back';
  readonly column: number;
  readonly row: number;
  readonly contestId: ContestId;
  readonly writeInIndex: number;
}
export const GridPositionWriteInSchema: z.ZodSchema<GridPositionWriteIn> =
  z.object({
    type: z.literal('write-in'),
    side: z.union([z.literal('front'), z.literal('back')]),
    column: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
    contestId: ContestIdSchema,
    writeInIndex: z.number().int().nonnegative(),
  });

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
  readonly quickResultsReportingUrl?: string; // a server where results are posted, enables VxQR if present
  readonly seal?: string;
  readonly sealUrl?: string;
  readonly state: string;
  readonly title: string;
}
export const ElectionSchema: z.ZodSchema<Election> = z
  .object({
    _lang: TranslationsSchema.optional(),
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
    quickResultsReportingUrl: z
      .string()
      .url()
      .nonempty()
      .refine((val) => !val.endsWith('/'), 'URL cannot end with a slash')
      .optional(),
    seal: z.string().nonempty().optional(),
    sealUrl: z.string().nonempty().optional(),
    state: z.string().nonempty(),
    title: z.string().nonempty(),
  })
  .superRefine((election, ctx) => {
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
          for (const [i, partyId] of (candidate.partyIds ?? []).entries()) {
            if (!election.parties.some((p) => p.id === partyId)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
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
  electionHash: string;
}
export const ElectionDefinitionSchema: z.ZodSchema<ElectionDefinition> =
  z.object({
    election: ElectionSchema,
    electionData: z.string().nonempty(),
    electionHash: ElectionHash,
  });
export type OptionalElectionDefinition = Optional<ElectionDefinition>;
export const OptionalElectionDefinitionSchema: z.ZodSchema<OptionalElectionDefinition> =
  ElectionDefinitionSchema.optional();

// Votes
export type CandidateVote = readonly Candidate[];
export const CandidateVoteSchema: z.ZodSchema<CandidateVote> =
  z.array(CandidateSchema);
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
export const VotesDictSchema: z.ZodSchema<VotesDict> = z.record(VoteSchema);

export enum BallotType {
  Standard = 0,
  Absentee = 1,
  Provisional = 2,
}
export const BallotTypeSchema: z.ZodSchema<BallotType> =
  z.nativeEnum(BallotType);

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
export const CandidateContestOptionSchema: z.ZodSchema<CandidateContestOption> =
  z.object({
    type: z.literal('candidate'),
    id: CandidateIdSchema,
    contestId: ContestIdSchema,
    name: z.string(),
    isWriteIn: z.boolean(),
    optionIndex: z.number().nonnegative(),
  });

export type YesNoContestOptionId = Exclude<
  YesNoVote[0] | YesNoVote[1],
  undefined
>;
export const YesNoContestOptionIdSchema: z.ZodSchema<YesNoContestOptionId> =
  z.union([z.literal('yes'), z.literal('no')]);
export interface YesNoContestOption {
  type: YesNoContest['type'];
  id: YesNoContestOptionId;
  contestId: YesNoContest['id'];
  name: string;
  optionIndex: number;
}
export const YesNoContestOptionSchema: z.ZodSchema<YesNoContestOption> =
  z.object({
    type: z.literal('yesno'),
    id: z.union([z.literal('yes'), z.literal('no')]),
    contestId: ContestIdSchema,
    name: z.string(),
    optionIndex: z.number().nonnegative(),
  });

export type MsEitherNeitherContestOptionId =
  | MsEitherNeitherContest['eitherOption']['id']
  | MsEitherNeitherContest['neitherOption']['id']
  | MsEitherNeitherContest['firstOption']['id']
  | MsEitherNeitherContest['secondOption']['id'];
export const MsEitherNeitherContestOptionIdSchema: z.ZodSchema<MsEitherNeitherContestOptionId> =
  YesNoOptionIdSchema;

export interface MsEitherNeitherContestOption {
  type: MsEitherNeitherContest['type'];
  id: MsEitherNeitherContestOptionId;
  contestId:
    | MsEitherNeitherContest['eitherNeitherContestId']
    | MsEitherNeitherContest['pickOneContestId'];
  name: string;
  optionIndex: number;
}
export const MsEitherNeitherContestOptionSchema: z.ZodSchema<MsEitherNeitherContestOption> =
  z.object({
    type: z.literal('ms-either-neither'),
    id: MsEitherNeitherContestOptionIdSchema,
    contestId: ContestIdSchema,
    name: z.string(),
    optionIndex: z.number().nonnegative(),
  });

export type ContestOption =
  | CandidateContestOption
  | YesNoContestOption
  | MsEitherNeitherContestOption;
export const ContestOptionSchema: z.ZodSchema<ContestOption> = z.union([
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
export const UninterpretableBallotAdjudicationReasonInfoSchema: z.ZodSchema<UninterpretableBallotAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.UninterpretableBallot),
  });

export interface MarginalMarkAdjudicationReasonInfo {
  type: AdjudicationReason.MarginalMark;
  contestId: ContestId;
  optionId: ContestOptionId;
  optionIndex: number;
}
export const MarginalMarkAdjudicationReasonInfoSchema: z.ZodSchema<MarginalMarkAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.MarginalMark),
    contestId: ContestIdSchema,
    optionId: ContestOptionIdSchema,
    optionIndex: z.number(),
  });

export interface OvervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Overvote;
  contestId: ContestId;
  optionIds: ReadonlyArray<ContestOption['id']>;
  optionIndexes: readonly number[];
  expected: number;
}
export const OvervoteAdjudicationReasonInfoSchema: z.ZodSchema<OvervoteAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.Overvote),
    contestId: ContestIdSchema,
    optionIds: z.array(ContestOptionIdSchema),
    optionIndexes: z.array(z.number().nonnegative()),
    expected: z.number(),
  });

export interface UndervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Undervote;
  contestId: ContestId;
  optionIds: ReadonlyArray<ContestOption['id']>;
  optionIndexes: readonly number[];
  expected: number;
}
export const UndervoteAdjudicationReasonInfoSchema: z.ZodSchema<UndervoteAdjudicationReasonInfo> =
  z.object({
    type: z.literal(AdjudicationReason.Undervote),
    contestId: ContestIdSchema,
    optionIds: z.array(ContestOptionIdSchema),
    optionIndexes: z.array(z.number().nonnegative()),
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
  | UninterpretableBallotAdjudicationReasonInfo
  | MarginalMarkAdjudicationReasonInfo
  | OvervoteAdjudicationReasonInfo
  | UndervoteAdjudicationReasonInfo
  | BlankBallotAdjudicationReasonInfo;
export const AdjudicationReasonInfoSchema: z.ZodSchema<AdjudicationReasonInfo> =
  z.union([
    UninterpretableBallotAdjudicationReasonInfoSchema,
    MarginalMarkAdjudicationReasonInfoSchema,
    OvervoteAdjudicationReasonInfoSchema,
    UndervoteAdjudicationReasonInfoSchema,
    BlankBallotAdjudicationReasonInfoSchema,
  ]);

export type BallotId = NewType<string, 'BallotId'>;
export const BallotIdSchema = z
  .string()
  .nonempty()
  .refine(
    (ballotId) => !ballotId.startsWith('_'),
    'Ballot IDs must not start with an underscore'
  ) as unknown as z.ZodSchema<BallotId>;

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
export const HmpbBallotPageMetadataSchema: z.ZodSchema<HmpbBallotPageMetadata> =
  z.object({
    electionHash: ElectionHash,
    precinctId: PrecinctIdSchema,
    ballotStyleId: BallotStyleIdSchema,
    locales: BallotLocaleSchema,
    pageNumber: z.number(),
    isTestMode: z.boolean(),
    ballotType: BallotTypeSchema,
    ballotId: BallotIdSchema.optional(),
  });

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
export const BallotCandidateTargetMarkSchema: z.ZodSchema<BallotCandidateTargetMark> =
  z.object({
    type: z.literal('candidate'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: z.union([CandidateIdSchema, WriteInIdSchema]),
    score: z.number().min(0).max(1),
    scoredOffset: OffsetSchema,
    writeInTextScore: z.number().min(0).max(1).optional(),
  });

export interface BallotYesNoTargetMark {
  type: YesNoContest['type'];
  bounds: Rect;
  contestId: ContestId;
  target: TargetShape;
  optionId: 'yes' | 'no';
  score: number;
  scoredOffset: Offset;
}
export const BallotYesNoTargetMarkSchema: z.ZodSchema<BallotYesNoTargetMark> =
  z.object({
    type: z.literal('yesno'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: z.union([z.literal('yes'), z.literal('no')]),
    score: z.number(),
    scoredOffset: OffsetSchema,
  });

export interface BallotMsEitherNeitherTargetMark {
  type: MsEitherNeitherContest['type'];
  bounds: Rect;
  contestId: ContestId;
  target: TargetShape;
  optionId: YesNoOptionId;
  score: number;
  scoredOffset: Offset;
}
export const BallotMsEitherNeitherTargetMarkSchema: z.ZodSchema<BallotMsEitherNeitherTargetMark> =
  z.object({
    type: z.literal('ms-either-neither'),
    bounds: RectSchema,
    contestId: ContestIdSchema,
    target: TargetShapeSchema,
    optionId: YesNoOptionIdSchema,
    score: z.number(),
    scoredOffset: OffsetSchema,
  });

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

export interface InlineBallotImage {
  normalized: string;
}
export const InlineBallotImageSchema: z.ZodSchema<InlineBallotImage> = z.object(
  {
    normalized: z.string(),
  }
);

export interface CompletedBallot {
  readonly electionHash: string;
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
  readonly ballotId?: BallotId;
  readonly votes: VotesDict;
  readonly isTestMode: boolean;
  readonly ballotType: BallotType;
}

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
 * Gets all contests whose IDs are in the given array. Does not special-case Ms
 * Either/Neither contests.
 */
export function getContestsFromIds(
  election: Election,
  contestIds: readonly ContestId[]
): Contests {
  return Array.from(new Set(contestIds)).map((id) => {
    const contest = election.contests.find((c) => c.id === id);
    if (!contest) {
      throw new Error(`Contest ${id} not found`);
    }
    return contest;
  });
}

/**
 * Gets all parties for a given candidate.
 */
export function getCandidateParties(
  parties: Parties,
  candidate: Candidate
): Parties {
  if (!candidate.partyIds) {
    return [];
  }

  return candidate.partyIds.map((id) => {
    const party = parties.find((p) => p.id === id);
    if (!party) {
      throw new Error(`Party ${id} not found`);
    }
    return party;
  });
}

/**
 * Gets a description of all the parties for a given candidate. If in the future
 * the order of the parties changes according to the election, this function
 * will need to be updated.
 */
export function getCandidatePartiesDescription(
  election: Election,
  candidate: Candidate
): string {
  const parties = getCandidateParties(election.parties, candidate);
  return parties.map((p) => p.name).join(', ');
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

/**
 * Gets the abbreviation of the political party for a primary election,
 * e.g. "R" or "D".
 */
export function getPartyAbbreviationByPartyId({
  partyId,
  election,
}: {
  partyId: PartyId;
  election: Election;
}): string {
  const party = election.parties.find((p) => p.id === partyId);
  return party?.abbrev ?? '';
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
      (element) => copyWithLocale(element, locale) as unknown as T
    );
  }

  if (typeof value === 'undefined') {
    return value;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const lang = '_lang' in record && (record['_lang'] as Translations);

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
 * Pre-process an election definition to make it easier to work with.
 */
function preprocessElection(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  // We're casting it here to make it easier to use, but in this function you
  // must assume the type is unknown.
  let election = value as Election;

  // Replace the deprecated `adjudicationReasons` property. Just use the value
  // for both precinct and central versions. If either of them is set already,
  // don't do anything and just let validation fail.
  if (
    'adjudicationReasons' in election &&
    !('precinctScanAdjudicationReasons' in election) &&
    !('centralScanAdjudicationReasons' in election)
  ) {
    interface ElectionWithAdjudicationReasons extends Election {
      readonly adjudicationReasons: AdjudicationReason[];
    }

    const { adjudicationReasons, ...rest } =
      election as ElectionWithAdjudicationReasons;
    election = {
      ...rest,
      precinctScanAdjudicationReasons: adjudicationReasons,
      centralScanAdjudicationReasons: adjudicationReasons,
    };
  }

  // Handle the renamed `sealURL` property.
  /* eslint-disable vx/gts-identifiers */
  if ('sealURL' in value) {
    interface ElectionWithSealURL extends Election {
      readonly sealURL: string;
    }

    const { sealURL, ...rest } = election as ElectionWithSealURL;
    election = { ...rest, sealUrl: sealURL };
  }
  /* eslint-enable vx/gts-identifiers */

  // Convert specific known date formats to ISO 8601.
  if (
    typeof election.date === 'string' &&
    !DateTime.fromISO(election.date).isValid
  ) {
    // e.g. 2/18/2020
    const parsedMonthDayYearDate = DateTime.fromFormat(
      election.date,
      'M/d/yyyy'
    );

    if (parsedMonthDayYearDate.isValid) {
      election = { ...election, date: parsedMonthDayYearDate.toISO() };
    }

    // e.g. February 18th, 2020
    const parsedMonthNameDayYearDate = DateTime.fromFormat(
      election.date.replace(/(\d+)(st|nd|rd|th)/, '$1'),
      'MMMM d, yyyy'
    );

    if (parsedMonthNameDayYearDate.isValid) {
      election = { ...election, date: parsedMonthNameDayYearDate.toISO() };
    }
  }

  // Fill in `Party#fullName` from `Party#name` if it's missing.
  const isMissingPartyFullName = election.parties?.some(
    /* istanbul ignore next */
    (party) => !party?.fullName
  );

  /* istanbul ignore next */
  if (isMissingPartyFullName) {
    election = {
      ...election,
      parties: election.parties?.map((party) =>
        !party
          ? party
          : {
              ...party,
              fullName: party.fullName ?? party.name,
            }
      ),
    };
  }

  // Handle single `partyId` on candidates.
  if (election.contests) {
    interface CandidateWithPartyId extends Candidate {
      readonly partyId?: PartyId;
    }

    const hasPartyId = election.contests.some(
      (contest) =>
        /* istanbul ignore next */
        contest?.type === 'candidate' &&
        contest.candidates.some(
          (candidate: CandidateWithPartyId) => candidate?.partyId
        )
    );

    if (hasPartyId) {
      election = {
        ...election,
        contests: election.contests.map((contest) => {
          /* istanbul ignore next */
          if (contest?.type !== 'candidate' || !contest.candidates) {
            return contest;
          }

          return {
            ...contest,
            candidates: contest.candidates.map(
              (candidate: CandidateWithPartyId) => {
                /* istanbul ignore next */
                if (!candidate?.partyId) {
                  return candidate;
                }

                return {
                  ...candidate,
                  partyIds: [candidate.partyId],
                };
              }
            ),
          };
        }),
      };
    }
  }

  return election;
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
    const parsed = safeParseJson(value);
    if (parsed.isErr()) {
      return parsed;
    }
    return safeParseElection(parsed.ok());
  }
  return safeParse(ElectionSchema, preprocessElection(value));
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
        electionHash: sha256(value),
      });
}
