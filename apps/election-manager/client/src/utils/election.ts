import {
  Election,
  BallotStyle,
  Contests,
  AnyContest,
  MsEitherNeitherContest,
  VotesDict,
} from '@votingworks/ballot-encoder'
import dashify from 'dashify'
import { LANGUAGES } from '../config/globals'
import { BallotLocale, Dictionary } from '../config/types'

import find from './find'

export const getContests = ({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle
  election: Election
}) =>
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
}) => election.precincts.find((p) => p.id === precinctId)

export const getBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}) => election.ballotStyles.find((bs) => bs.id === ballotStyleId) as BallotStyle

export const getPartyFullNameFromBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}): string => {
  const { partyId } = getBallotStyle({ ballotStyleId, election })
  const party = election.parties.find((p) => p.id === partyId)
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

export const getBallotStylesData = (election: Election) =>
  election.ballotStyles
    .map((ballotStyle) => ({
      ballotStyleId: ballotStyle.id,
      precinctIds: ballotStyle.precincts,
      contestIds: election.contests
        .filter((c) => ballotStyle.districts.includes(c.districtId))
        .map((c) => c.id),
    }))
    .sort((a, b) =>
      a.ballotStyleId.localeCompare(b.ballotStyleId, undefined, sortOptions)
    )

export const getBallotStylesDataByStyle = (election: Election) =>
  getBallotStylesData(election).reduce<BallotStyleData[]>(
    (accumulator, currentValue) =>
      accumulator.concat(
        currentValue.precinctIds.map((precinctId) => ({
          ...currentValue,
          precinctId,
        }))
      ),
    []
  )

export const getBallotStylesDataByPrecinct = (election: Election) =>
  [...getBallotStylesDataByStyle(election)].sort((a, b) => {
    const nameA = election.precincts.find((p) => p.id === a.precinctId)!.name
    const nameB = election.precincts.find((p) => p.id === b.precinctId)!.name
    return nameA.localeCompare(nameB, undefined, sortOptions)
  })

export const getLanguageByLocaleCode = (localeCode: string) =>
  LANGUAGES[localeCode.split('-')[0]] ?? localeCode

export const getHumanBallotLanguageFormat = (locales: BallotLocale) =>
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
}) => {
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
}: GenerateTestDeckParams) => {
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
