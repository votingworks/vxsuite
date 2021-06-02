import check8601 from '@antongolub/iso8601'
import { createHash } from 'crypto'
import * as z from 'zod'
import * as t from './election'
import {
  AdjudicationReason as AdjudicationReasonEnum,
  BallotPaperSize as BallotPaperSizeEnum,
} from './election'
import { err, ok, Result } from './generic'

// Generic
export const Translations = z.record(z.record(z.string()))
export const Id = z
  .string()
  .nonempty()
  .refine((id) => !id.startsWith('_'), 'IDs may not start with an underscore')
  .refine(
    (id) => /^[-_a-z\d]+$/i.test(id),
    'IDs may only contain letters, numbers, dashes, and underscores'
  )
export const HexString: z.ZodSchema<string> = z
  .string()
  .nonempty()
  .refine(
    (hex) => /^[0-9a-f]*$/i.test(hex),
    'hex strings must contain only 0-9 and a-f'
  )
export const ISO8601Date = z
  .string()
  .refine(check8601, 'dates must be in ISO8601 format')

function* findDuplicateIds<T extends { id: unknown }>(
  identifiables: Iterable<T>
): Generator<[number, T['id']]> {
  const knownIds = new Set<T['id']>()

  for (const [index, { id }] of [...identifiables].entries()) {
    if (knownIds.has(id)) {
      yield [index, id]
    } else {
      knownIds.add(id)
    }
  }
}

// Candidates
export const Candidate: z.ZodSchema<t.Candidate> = z.object({
  _lang: Translations.optional(),
  id: Id,
  name: z.string().nonempty(),
  partyId: Id.optional(),
  isWriteIn: z.boolean().optional(),
})

export const OptionalCandidate = Candidate.optional()

// Contests
export const ContestTypes: z.ZodSchema<t.ContestTypes> = z.union([
  z.literal('candidate'),
  z.literal('yesno'),
  z.literal('ms-either-neither'),
])

const ContestInternal = z.object({
  _lang: Translations.optional(),
  id: Id,
  districtId: Id,
  partyId: Id.optional(),
  section: z.string().nonempty(),
  title: z.string().nonempty(),
  type: ContestTypes,
})

export const Contest: z.ZodSchema<t.Contest> = ContestInternal

export const CandidateContest: z.ZodSchema<t.CandidateContest> = ContestInternal.merge(
  z.object({
    type: z.literal('candidate'),
    seats: z.number().int().positive(),
    candidates: z.array(Candidate),
    allowWriteIns: z.boolean(),
  })
).superRefine((contest, ctx) => {
  for (const [index, id] of findDuplicateIds(contest.candidates)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidates', index, 'id'],
      message: `Duplicate candidate '${id}' found.`,
    })
  }
})

export const YesNoOption: z.ZodSchema<t.YesNoOption> = z.object({
  id: Id,
  label: z.string().nonempty(),
})

export const YesNoContest: z.ZodSchema<t.YesNoContest> = ContestInternal.merge(
  z.object({
    type: z.literal('yesno'),
    description: z.string().nonempty(),
    shortTitle: z.string().nonempty().optional(),
    yesOption: YesNoOption.optional(),
    noOption: YesNoOption.optional(),
  })
)

export const MsEitherOrContest: z.ZodSchema<t.MsEitherNeitherContest> = ContestInternal.merge(
  z.object({
    type: z.literal('ms-either-neither'),
    eitherNeitherContestId: Id,
    pickOneContestId: Id,
    description: z.string().nonempty(),
    eitherNeitherLabel: z.string().nonempty(),
    pickOneLabel: z.string().nonempty(),
    eitherOption: YesNoOption,
    neitherOption: YesNoOption,
    firstOption: YesNoOption,
    secondOption: YesNoOption,
  })
)

export const AnyContest: z.ZodSchema<t.AnyContest> = z.union([
  CandidateContest,
  YesNoContest,
  MsEitherOrContest,
])

export const Contests = z.array(AnyContest).superRefine((contests, ctx) => {
  for (const [index, id] of findDuplicateIds(contests)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [index, 'id'],
      message: `Duplicate contest '${id}' found.`,
    })
  }
})

// Hand-marked paper & adjudication
export const MarkThresholds: z.ZodSchema<t.MarkThresholds> = z
  .object({
    marginal: z.number().min(0).max(1),
    definite: z.number().min(0).max(1),
  })
  .refine(
    ({ marginal, definite }) => marginal <= definite,
    'marginal mark threshold must be less than or equal to definite mark threshold'
  )

export const AdjudicationReason: z.ZodSchema<t.AdjudicationReason> = z.lazy(
  () => z.nativeEnum(AdjudicationReasonEnum)
)

export const BallotPaperSize: z.ZodSchema<t.BallotPaperSize> = z.lazy(() =>
  z.nativeEnum(BallotPaperSizeEnum)
)

// Election
export const BallotStyle: z.ZodSchema<t.BallotStyle> = z.object({
  _lang: Translations.optional(),
  id: Id,
  precincts: z.array(Id),
  districts: z.array(Id),
  partyId: Id.optional(),
})

export const BallotStyles = z
  .array(BallotStyle)
  .superRefine((ballotStyles, ctx) => {
    for (const [index, id] of findDuplicateIds(ballotStyles)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'id'],
        message: `Duplicate ballot style '${id}' found.`,
      })
    }
  })

export const Party: z.ZodSchema<t.Party> = z.object({
  _lang: Translations.optional(),
  id: Id,
  name: z.string().nonempty(),
  fullName: z.string().nonempty(),
  abbrev: z.string().nonempty(),
})

export const Parties: z.ZodSchema<t.Parties> = z
  .array(Party)
  .superRefine((parties, ctx) => {
    for (const [index, id] of findDuplicateIds(parties)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'id'],
        message: `Duplicate party '${id}' found.`,
      })
    }
  })

export const Precinct: z.ZodSchema<t.Precinct> = z.object({
  _lang: Translations.optional(),
  id: Id,
  name: z.string().nonempty(),
})

export const Precincts = z.array(Precinct).superRefine((precincts, ctx) => {
  for (const [index, id] of findDuplicateIds(precincts)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [index, 'id'],
      message: `Duplicate precinct '${id}' found.`,
    })
  }
})

export const District: z.ZodSchema<t.District> = z.object({
  _lang: Translations.optional(),
  id: Id,
  name: z.string().nonempty(),
})

export const Districts = z.array(District).superRefine((districts, ctx) => {
  for (const [index, id] of findDuplicateIds(districts)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [index, 'id'],
      message: `Duplicate district '${id}' found.`,
    })
  }
})

export const County: z.ZodSchema<t.County> = z.object({
  _lang: Translations.optional(),
  id: Id,
  name: z.string().nonempty(),
})

const BallotLayout = z.object({
  paperSize: BallotPaperSize,
})

export const Election: z.ZodSchema<t.Election> = z
  .object({
    _lang: Translations.optional(),
    adjudicationReasons: z.array(AdjudicationReason).optional(),
    ballotLayout: BallotLayout.optional(),
    ballotStrings: z.record(z.union([z.string(), Translations])).optional(),
    ballotStyles: BallotStyles,
    contests: Contests,
    county: County,
    date: ISO8601Date,
    districts: Districts,
    markThresholds: MarkThresholds.optional(),
    parties: Parties,
    precincts: Precincts,
    seal: z.string().nonempty().optional(),
    sealURL: z.string().nonempty().optional(),
    state: z.string().nonempty(),
    title: z.string().nonempty(),
  })
  .superRefine((election, ctx) => {
    for (const [
      ballotStyleIndex,
      { id, districts, precincts },
    ] of election.ballotStyles.entries()) {
      for (const [districtIndex, districtId] of districts.entries()) {
        if (!election.districts.some(({ id }) => id === districtId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'ballotStyles',
              ballotStyleIndex,
              'districts',
              districtIndex,
            ],
            message: `Ballot style '${id}' has district '${districtId}', but no such district is defined. Districts defined: [${election.districts
              .map(({ id }) => id)
              .join(', ')}].`,
          })
        }
      }

      for (const [precinctIndex, precinctId] of precincts.entries()) {
        if (!election.precincts.some(({ id }) => id === precinctId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              'ballotStyles',
              ballotStyleIndex,
              'precincts',
              precinctIndex,
            ],
            message: `Ballot style '${id}' has precinct '${precinctId}', but no such precinct is defined. Precincts defined: [${election.precincts
              .map(({ id }) => id)
              .join(', ')}].`,
          })
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
          })
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
            })
          }
        }
      }
    }
  })

export const OptionalElection: z.ZodSchema<t.OptionalElection> = Election.optional()
export const ElectionDefinition: z.ZodSchema<t.ElectionDefinition> = z.object({
  election: Election,
  electionData: z.string(),
  electionHash: z.string(),
})
export const OptionalElectionDefinition: z.ZodSchema<t.OptionalElectionDefinition> = ElectionDefinition.optional()

// Votes
export const CandidateVote: z.ZodSchema<t.CandidateVote> = z.array(Candidate)
export const YesNoVote: z.ZodSchema<t.YesNoVote> = z.union([
  z.tuple([z.literal('yes')]),
  z.tuple([z.literal('no')]),
  z.tuple([z.literal('yes'), z.literal('no')]),
  z.tuple([z.literal('no'), z.literal('yes')]),
  z.tuple([]),
])
export const OptionalYesNoVote: z.ZodSchema<t.OptionalYesNoVote> = YesNoVote.optional()
export const Vote: z.ZodSchema<t.Vote> = z.union([CandidateVote, YesNoVote])
export const OptionalVote: z.ZodSchema<t.OptionalVote> = Vote.optional()
export const VotesDict: z.ZodSchema<t.VotesDict> = z.record(Vote)

export const BallotType = z.nativeEnum(t.BallotType)

export const CardDataTypes: z.ZodSchema<t.CardDataTypes> = z.union([
  z.literal('voter'),
  z.literal('pollworker'),
  z.literal('admin'),
])

const CardDataInternal = z.object({
  t: CardDataTypes,
})
export const CardData: z.ZodSchema<t.CardData> = CardDataInternal

export const VoterCardData: z.ZodSchema<t.VoterCardData> = CardDataInternal.extend(
  {
    t: z.literal('voter'),
    c: z.number(),
    bs: Id,
    pr: Id,
    uz: z.number().optional(),
    bp: z.number().optional(),
    u: z.number().optional(),
    m: Id.optional(),
  }
)

export const PollworkerCardData: z.ZodSchema<t.PollworkerCardData> = CardDataInternal.extend(
  {
    t: z.literal('pollworker'),
    h: HexString,
  }
)

export const AdminCardData: z.ZodSchema<t.AdminCardData> = CardDataInternal.extend(
  {
    t: z.literal('admin'),
    h: HexString,
  }
)

export const AnyCardData: z.ZodSchema<t.AnyCardData> = z.union([
  VoterCardData,
  PollworkerCardData,
  AdminCardData,
])

/**
 * Parse `value` using `parser`. Note that this takes an object that is already
 * supposed to be of type `T`, not a JSON string. For that, use `safeParseJSON`.
 *
 * @returns `Ok` when the parse succeeded, `Err` otherwise.
 */
export function safeParse<T>(
  parser: z.ZodType<T>,
  value: unknown
): Result<T, z.ZodError> {
  const result = parser.safeParse(value)

  if (!result.success) {
    return err(result.error)
  }

  return ok(result.data)
}

/**
 * Parse JSON without throwing an exception if it's malformed. On success the
 * result will be `Ok<unknown>` and you'll need to validate the result yourself.
 * Given malformed JSON, the result will be `Err<SyntaxError>`. Add a parser
 * argument to automatically validate the resulting value after deserializing
 * the JSON.
 */
export function safeParseJSON(text: string): Result<unknown, SyntaxError>
/**
 * Parse JSON and then validate the result with `parser`.
 */
export function safeParseJSON<T>(
  text: string,
  parser: z.ZodType<T>
): Result<T, z.ZodError | SyntaxError>
export function safeParseJSON<T>(
  text: string,
  parser?: z.ZodType<T>
): Result<T | unknown, z.ZodError | SyntaxError> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return err(error as SyntaxError)
  }

  return parser ? safeParse(parser, parsed) : ok(parsed)
}

/**
 * @deprecated use `safeParseElection(…)` instead
 */
export function parseElection(value: unknown): t.Election {
  return safeParseElection(value).unwrap()
}

/**
 * Parses `value` as an `Election` encoded as a JSON string. Equivalent to
 * `safeParseJSON(Election, value)`.
 */
export function safeParseElection(
  value: string
): Result<t.Election, z.ZodError | SyntaxError>
/**
 * Parses `value` as an `Election` object. Equivalent to
 * `safeParse(Election, value)`.
 */
export function safeParseElection(
  value: unknown
): Result<t.Election, z.ZodError>
export function safeParseElection(
  value: unknown
): Result<t.Election, z.ZodError | SyntaxError> {
  if (typeof value === 'string') {
    return safeParseJSON(value, Election)
  } else {
    return safeParse(Election, value)
  }
}

/**
 * Parses `value` as a JSON `Election`, computing the election hash if the
 * result is `Ok`.
 */
export function safeParseElectionDefinition(
  value: string
): Result<t.ElectionDefinition, z.ZodError | SyntaxError> {
  return safeParseElection(value).map((election) => ({
    election,
    electionData: value,
    electionHash: createHash('sha256').update(value).digest('hex'),
  }))
}
