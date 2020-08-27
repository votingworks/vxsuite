import {
  Election,
  BallotStyle,
  Contests,
  AnyContest,
  MsEitherNeitherContest,
} from '@votingworks/ballot-encoder'
import dashify from 'dashify'
import { LANGUAGES } from '../config/globals'
import { BallotLocale } from '../config/types'

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
