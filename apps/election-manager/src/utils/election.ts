import {
  Election,
  BallotStyle,
  Candidate,
  Contests,
  AnyContest,
  MsEitherNeitherContest,
  VotesDict,
  Precinct,
} from '@votingworks/types'
import dashify from 'dashify'
import { LANGUAGES } from '../config/globals'
import {
  BallotLocale,
  Dictionary,
  YesNoOption,
  ContestOption,
} from '../config/types'

import find from './find'
import sortBy from './sortBy'

// the generic write-in candidate to keep count
export const writeInCandidate: Candidate = {
  id: '__write-in',
  name: 'Write-In',
  isWriteIn: true,
}

export function getDistrictIdsForPartyId(
  election: Election,
  partyId: string
): string[] {
  return election.ballotStyles
    .filter((bs) => bs.partyId === partyId)
    .flatMap((bs) => bs.districts)
}

export function getContestOptionsForContest(
  contest: AnyContest
): readonly ContestOption[] {
  if (contest.type === 'candidate') {
    const options = contest.candidates
    if (contest.allowWriteIns) {
      return options.concat(writeInCandidate)
    }
    return options
  }
  if (contest.type === 'yesno') {
    return [['yes'] as YesNoOption, ['no'] as YesNoOption]
  }
  throw new Error(`Unexpected contest type: ${contest.type}`)
}

export const getContests = ({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle
  election: Election
}): Contests =>
  election.contests.filter(
    (c) =>
      ballotStyle.districts.includes(c.districtId) &&
      ballotStyle.partyId === c.partyId
  )

export const getEitherNeitherContests = (
  contests: Contests
): MsEitherNeitherContest[] =>
  contests.filter(
    (c): c is MsEitherNeitherContest => c.type === 'ms-either-neither'
  )

export const expandEitherNeitherContests = (
  contests: Contests
): Exclude<AnyContest, MsEitherNeitherContest>[] =>
  contests.flatMap((contest) =>
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
          },
        ]
  )

export const getPrecinctById = ({
  election,
  precinctId,
}: {
  election: Election
  precinctId: string
}): Precinct | undefined => election.precincts.find((p) => p.id === precinctId)

export const getBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}): BallotStyle | undefined =>
  election.ballotStyles.find((bs) => bs.id === ballotStyleId)

export const getPartyFullNameFromBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}): string => {
  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  const party = election.parties.find((p) => p.id === ballotStyle?.partyId)
  return party?.fullName || ''
}

interface BallotStyleData {
  ballotStyleId: string
  contestIds: string[]
  precinctId: string
}

const sortOptions = {
  ignorePunctuation: true,
  numeric: true,
}

export const getBallotStylesData = (election: Election): BallotStyleData[] =>
  election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map<BallotStyleData>((precinctId) => ({
      ballotStyleId: ballotStyle.id,
      precinctId,
      contestIds: getContests({ ballotStyle, election }).map((c) => c.id),
    }))
  )

const ballotStyleComparator = (a: BallotStyleData, b: BallotStyleData) =>
  a.ballotStyleId.localeCompare(b.ballotStyleId, undefined, sortOptions)

const makePrecinctComparator = (election: Election) => (
  a: BallotStyleData,
  b: BallotStyleData
) =>
  election.precincts
    .find((p) => p.id === a.precinctId)!
    .name.localeCompare(
      election.precincts.find((p) => p.id === b.precinctId)!.name,
      undefined,
      sortOptions
    )

export const sortBallotStyleDataByStyle = (
  election: Election,
  styles: readonly BallotStyleData[]
): BallotStyleData[] =>
  sortBy(styles, ballotStyleComparator, makePrecinctComparator(election))

export const sortBallotStyleDataByPrecinct = (
  election: Election,
  styles: readonly BallotStyleData[]
): BallotStyleData[] =>
  sortBy(styles, makePrecinctComparator(election), ballotStyleComparator)

export const getBallotStylesDataByStyle = (
  election: Election
): BallotStyleData[] =>
  sortBallotStyleDataByStyle(election, getBallotStylesData(election))

export const getLanguageByLocaleCode = (localeCode: string): string =>
  LANGUAGES[localeCode.split('-')[0]] ?? localeCode

export const getHumanBallotLanguageFormat = (locales: BallotLocale): string =>
  !locales.secondary
    ? getLanguageByLocaleCode(locales.primary)
    : `${getLanguageByLocaleCode(locales.primary)}/${getLanguageByLocaleCode(
        locales.secondary
      )}`

export const getBallotPath = ({
  ballotStyleId,
  election,
  electionHash,
  precinctId,
  locales,
  isLiveMode,
}: {
  ballotStyleId: string
  election: Election
  electionHash: string
  precinctId: string
  locales: BallotLocale
  isLiveMode: boolean
}): string => {
  const precinctName = getPrecinctById({
    election,
    precinctId,
  })!.name

  return `${isLiveMode ? 'live' : 'test'}/election-${electionHash.slice(
    0,
    10
  )}-precinct-${dashify(
    precinctName
  )}-id-${precinctId}-style-${ballotStyleId}-${getHumanBallotLanguageFormat(
    locales
  ).replace(/[^a-z]+/gi, '-')}.pdf`
}

interface GenerateTestDeckParams {
  election: Election
  precinctId?: string
}

export const generateTestDeckBallots = ({
  election,
  precinctId,
}: GenerateTestDeckParams): Dictionary<string | VotesDict>[] => {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id)

  const ballots: Dictionary<string | VotesDict>[] = []

  precincts.forEach((precinctId) => {
    const precinct = find(election.precincts, (p) => p.id === precinctId)
    const precinctBallotStyles = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    )

    precinctBallotStyles.forEach((ballotStyle) => {
      const contests = election.contests.filter(
        (c) =>
          ballotStyle.districts.includes(c.districtId) &&
          ballotStyle.partyId === c.partyId
      )

      const numBallots = Math.max(
        ...contests.map((c) =>
          c.type === 'candidate' ? c.candidates.length : 2
        )
      )

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum++) {
        const votes: VotesDict = {}
        contests.forEach((contest) => {
          if (contest.type === 'yesno') {
            votes[contest.id] = ballotNum % 2 === 0 ? ['yes'] : ['no']
          } else if (contest.type === 'ms-either-neither') {
            votes[contest.eitherNeitherContestId] =
              ballotNum % 2 === 0 ? ['yes'] : ['no']
            votes[contest.pickOneContestId] =
              ballotNum % 2 === 0 ? ['yes'] : ['no']
          } else if (
            contest.type === 'candidate' &&
            contest.candidates.length > 0 // safety check
          ) {
            votes[contest.id] = [
              contest.candidates[ballotNum % contest.candidates.length],
            ]
          }
        })
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId,
          votes,
        })
      }
    })
  })

  return ballots
}
