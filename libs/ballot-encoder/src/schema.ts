import * as z from 'zod'
import check8601 from '@antongolub/iso8601'

/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars */
// @ts-ignore
import type { objectUtil } from 'zod/lib/src/helpers/objectUtil'

// Generic
export const Translations = z.record(z.record(z.string()))

// Candidates
export const Candidate = z.object({
  _lang: Translations.optional(),
  id: z.string().nonempty(),
  name: z.string().nonempty(),
  partyId: z.string().nonempty().optional(),
  isWriteIn: z.boolean().optional(),
})

export const OptionalCandidate = Candidate.optional()

// Contests
export const ContestTypes = z.union([
  z.literal('candidate'),
  z.literal('yesno'),
])

export const Contest = z.object({
  _lang: Translations.optional(),
  id: z.string().nonempty(),
  districtId: z.string().nonempty(),
  partyId: z.string().nonempty().optional(),
  section: z.string().nonempty(),
  title: z.string().nonempty(),
  type: ContestTypes,
})

export const CandidateContest = Contest.merge(
  z.object({
    type: z.literal('candidate'),
    seats: z.number().int().positive(),
    candidates: z.array(Candidate),
    allowWriteIns: z.boolean(),
  })
)

export const YesNoContest = Contest.merge(
  z.object({
    type: z.literal('yesno'),
    description: z.string().nonempty(),
    shortTitle: z.string().nonempty().optional(),
  })
)

export const Contests = z.array(z.union([CandidateContest, YesNoContest]))

// Election
export const BallotStyle = z.object({
  _lang: Translations.optional(),
  id: z.string().nonempty(),
  precincts: z.array(z.string().nonempty()),
  districts: z.array(z.string().nonempty()),
  partyId: z.string().nonempty().optional(),
})

export const Party = z.object({
  _lang: Translations.optional(),
  id: z.string().nonempty(),
  name: z.string().nonempty(),
  fullName: z.string().nonempty(),
  abbrev: z.string().nonempty(),
})

export const Parties = z.array(Party)

export const Precinct = z.object({
  _lang: Translations.optional(),
  id: z.string().nonempty(),
  name: z.string().nonempty(),
})

export const District = z.object({
  _lang: Translations.optional(),
  id: z.string().nonempty(),
  name: z.string().nonempty(),
})

export const County = z.object({
  _lang: Translations.optional(),
  id: z.string().nonempty(),
  name: z.string().nonempty(),
})

export const Election = z.object({
  _lang: Translations.optional(),
  ballotStyles: z.array(BallotStyle),
  county: County,
  parties: Parties,
  precincts: z.array(Precinct),
  districts: z.array(District),
  contests: Contests,
  date: z.string().refine(check8601, 'dates must be ISO 8601-formatted'),
  seal: z.string().nonempty().optional(),
  sealURL: z.string().nonempty().optional(),
  ballotStrings: z.record(z.union([z.string(), Translations])).optional(),
  state: z.string().nonempty(),
  title: z.string().nonempty(),
})

export const OptionalElection = Election.optional()

// Votes
export const CandidateVote = z.array(Candidate)
export const YesNoVote = z.union([z.literal('yes'), z.literal('no')])
export const OptionalYesNoVote = YesNoVote.optional()
export const Vote = z.union([CandidateVote, YesNoVote])
export const OptionalVote = Vote.optional()
export const VotesDict = z.record(Vote)

// Keep this in sync with `src/election.ts`.
export const BallotType = z.number().min(0).max(2)
