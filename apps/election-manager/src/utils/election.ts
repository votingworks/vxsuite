import {
  Election,
  BallotStyle,
  Contests,
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
  contests
    .filter((c) => c.type === 'ms-either-neither')
    .map((c) => c as MsEitherNeitherContest)

export const expandEitherNeitherContests = (contests: Contests): Contests => {
  const resultSet = new Set(contests)

  const eitherNeitherContests = getEitherNeitherContests(contests)
  eitherNeitherContests.forEach((c) => resultSet.delete(c))

  eitherNeitherContests.forEach((c) => {
    resultSet.add({
      id: c.eitherNeitherContestId,
      type: 'yesno',
      title: `${c.title} -- Either/Neither`,
      districtId: c.districtId,
      section: c.section,
      description: c.description,
      yesOption: c.eitherOption,
      noOption: c.neitherOption,
    })

    resultSet.add({
      id: c.pickOneContestId,
      type: 'yesno',
      title: `${c.title} -- Pick One`,
      districtId: c.districtId,
      section: c.section,
      description: c.description,
      yesOption: c.firstOption,
      noOption: c.secondOption,
    })
  })

  return Array.from(resultSet)
}

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
