import { Optional } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import * as z from 'zod';
import {
  Dictionary,
  ElectionHash,
  Id,
  IdSchema,
  Iso8601Date,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
  NewType,
} from './generic';
import {
  Offset,
  OffsetSchema,
  Rect,
  RectSchema,
  Size,
  SizeSchema,
} from './geometry';

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
  readonly partyIds?: readonly PartyId[];
}
export const WriteInCandidateSchema: z.ZodSchema<WriteInCandidate> = z.object({
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
}
export const CandidateContestSchema: z.ZodSchema<CandidateContest> =
  ContestInternalSchema.merge(
    z.object({
      type: z.literal('candidate'),
      seats: z.number().int().positive(),
      candidates: z.array(CandidateSchema),
      allowWriteIns: z.boolean(),
      partyId: PartyIdSchema.optional(),
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
  readonly yesOption?: YesNoOption;
  readonly noOption?: YesNoOption;
}
export const YesNoContestSchema: z.ZodSchema<YesNoContest> =
  ContestInternalSchema.merge(
    z.object({
      type: z.literal('yesno'),
      description: z.string().nonempty(),
      yesOption: YesNoOptionSchema.optional(),
      noOption: YesNoOptionSchema.optional(),
    })
  );

export type AnyContest = CandidateContest | YesNoContest;
export const AnyContestSchema: z.ZodSchema<AnyContest> = z.union([
  CandidateContestSchema,
  YesNoContestSchema,
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
  id: IdSchema,
  name: z.string().nonempty(),
});

/**
 * @deprecated to be replaced (https://github.com/votingworks/roadmap/issues/15)
 */
export interface BallotLocale {
  readonly primary: string;
  readonly secondary?: string;
}
/**
 * @deprecated to be replaced (https://github.com/votingworks/roadmap/issues/15)
 */
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
}
export const MarkThresholdsSchema: z.ZodSchema<MarkThresholds> = z
  .object({
    marginal: z.number().min(0).max(1),
    definite: z.number().min(0).max(1),
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
  /**
   * Area in timing mark units around a target mark (i.e. bubble) to consider
   * part of the option for that target mark. This is used to crop the image
   * to show the write-in area for a given grid position.
   */
  readonly optionBoundsFromTargetMark: Rect;
  readonly gridPositions: readonly GridPosition[];
}
export const GridLayoutSchema: z.ZodSchema<GridLayout> = z.object({
  precinctId: PrecinctIdSchema,
  ballotStyleId: BallotStyleIdSchema,
  columns: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  optionBoundsFromTargetMark: RectSchema,
  gridPositions: z.array(GridPositionSchema),
});

export interface Election {
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
export const ElectionDefinitionSchema: z.ZodSchema<ElectionDefinition> = z
  .object({
    election: ElectionSchema,
    electionData: z.string().nonempty(),
    electionHash: ElectionHash,
  })
  .superRefine((electionDefinition, ctx) => {
    const { electionData, electionHash } = electionDefinition;
    const electionDataHash = sha256(electionData);
    if (electionDataHash !== electionHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['electionHash'],
        message: `Election data hash '${electionDataHash}' does not match election hash '${electionHash}'.`,
      });
    }
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
  writeInIndex?: number;
}
export const CandidateContestOptionSchema: z.ZodSchema<CandidateContestOption> =
  z.object({
    type: z.literal('candidate'),
    id: CandidateIdSchema,
    contestId: ContestIdSchema,
    name: z.string(),
    isWriteIn: z.boolean(),
    optionIndex: z.number().nonnegative(),
    writeInIndex: z.number().nonnegative().optional(),
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
  /**
   * @deprecated to be replaced (https://github.com/votingworks/roadmap/issues/15)
   */
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
  optionId: 'yes' | 'no';
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
    optionId: z.union([z.literal('yes'), z.literal('no')]),
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
