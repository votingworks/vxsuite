import { Optional, DateWithoutTime } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import * as z from 'zod';
import {
  Dictionary,
  Sha256Hash,
  Id,
  IdSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
  NewType,
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
    for (const [index, id] of findDuplicateIds(
      contests.flatMap((c) =>
        c.type === 'yesno' ? [c.yesOption, c.noOption] : []
      )
    )) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'yes/noOption', 'id'],
        message: `Duplicate yes/no contest option '${id}' found.`,
      });
    }
  });

// Election
export type ElectionId = NewType<string, 'ElectionId'>;
export const ElectionIdSchema: z.ZodSchema<ElectionId> =
  IdSchema as unknown as z.ZodSchema<ElectionId>;

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

export type BallotStyleId = NewType<string, 'BallotStyleId'>;
export const BallotStyleIdSchema =
  IdSchema as unknown as z.ZodSchema<BallotStyleId>;

export interface BallotStyle {
  readonly id: BallotStyleId;
  readonly groupId: BallotStyleGroupId;
  readonly precincts: readonly PrecinctId[];
  readonly districts: readonly DistrictId[];
  readonly partyId?: PartyId;
  readonly languages?: readonly string[]; // TODO(kofi): Make required.
}

export type BallotStyleGroupId = NewType<string, 'BallotStyleGroupId'>;
export const BallotStyleGroupIdSchema =
  IdSchema as unknown as z.ZodSchema<BallotStyleGroupId>;
export interface BallotStyleGroup {
  readonly id: BallotStyleGroupId;
  readonly defaultLanguageBallotStyle: BallotStyle;
  readonly ballotStyles: readonly BallotStyle[];
  readonly precincts: readonly PrecinctId[];
  readonly districts: readonly DistrictId[];
  readonly partyId?: PartyId;
}

export const BallotStyleSchema: z.ZodSchema<BallotStyle> = z.object({
  id: BallotStyleIdSchema,
  groupId: BallotStyleGroupIdSchema,
  precincts: z.array(PrecinctIdSchema),
  districts: z.array(DistrictIdSchema),
  partyId: PartyIdSchema.optional(),
  languages: z.array(z.string()).optional(),
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

export enum HmpbBallotPaperSize {
  Letter = 'letter',
  Legal = 'legal',
  Custom17 = 'custom-8.5x17',
  Custom18 = 'custom-8.5x18',
  Custom21 = 'custom-8.5x21',
  Custom22 = 'custom-8.5x22',
}
export const HmpbBallotPaperSizeSchema: z.ZodSchema<HmpbBallotPaperSize> =
  z.nativeEnum(HmpbBallotPaperSize);

export enum BmdBallotPaperSize {
  Vsap150Thermal = 'vsap-150-thermal',
}
export const BmdBallotPaperSizeSchema: z.ZodSchema<BmdBallotPaperSize> =
  z.nativeEnum(BmdBallotPaperSize);

export type BallotPaperSize = HmpbBallotPaperSize | BmdBallotPaperSize;

export interface BallotLayout {
  paperSize: HmpbBallotPaperSize;
  metadataEncoding: 'qr-code' | 'timing-marks';
}
export const BallotLayoutSchema: z.ZodSchema<BallotLayout> = z.object({
  paperSize: HmpbBallotPaperSizeSchema,
  metadataEncoding: z.enum(['qr-code', 'timing-marks']),
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
  z.nativeEnum(AdjudicationReason);

export interface GridPositionOption {
  readonly type: 'option';
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  readonly column: number;
  readonly row: number;
  readonly contestId: ContestId;
  readonly optionId: Id;
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
  });

export interface GridPositionWriteIn {
  readonly type: 'write-in';
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  readonly column: number;
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
  readonly state: string;
  readonly title: string;
  readonly type: ElectionType;
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
    state: z.string().nonempty(),
    title: z.string().nonempty(),
    type: ElectionTypeSchema,
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
  .superRefine((electionDefinition, ctx) => {
    const { electionData, ballotHash } = electionDefinition;
    const electionDataHash = sha256(electionData);
    if (electionDataHash !== ballotHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ballotHash'],
        message: `Election data hash '${electionDataHash}' does not match ballot hash '${ballotHash}'.`,
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
export const VotesDictSchema: z.ZodSchema<VotesDict> = z.record(VoteSchema);

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

export type BallotId = NewType<string, 'BallotId'>;
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
  ballotId?: BallotId;
}
export const HmpbBallotPageMetadataSchema: z.ZodSchema<HmpbBallotPageMetadata> =
  z.object({
    ballotHash: Sha256Hash,
    precinctId: PrecinctIdSchema,
    ballotStyleId: BallotStyleIdSchema,
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
  readonly ballotId?: BallotId;
  readonly votes: VotesDict;
  readonly isTestMode: boolean;
  readonly ballotType: BallotType;
}
