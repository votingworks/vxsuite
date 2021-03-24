import { Election, ElectionDefinition } from '@votingworks/types'
import moment from 'moment'

const SECTION_SEPARATOR = '__'
const SUBSECTION_SEPARATOR = '_'
const WORD_SEPARATOR = '-'
const TIME_FORMAT_STRING = `YYYY${WORD_SEPARATOR}MM${WORD_SEPARATOR}DD${SUBSECTION_SEPARATOR}HH${WORD_SEPARATOR}mm${WORD_SEPARATOR}ss`

export const SCANNER_RESULTS_FOLDER = 'cast-vote-records'
export const BALLOT_PACKAGES_FOLDER = 'ballot-packages'

export type CVRFileData = {
  machineId: string
  numberOfBallots: number
  isTestModeResults: boolean
  timestamp: Date
}

function sanitizeString(input: string, replacement = ''): string {
  return input
    .replace(/[^a-z0-9]+/gi, replacement)
    .replace(/(^-|-$)+/g, '')
    .toLocaleLowerCase()
}

function generateElectionName(election: Election): string {
  const electionCountyName = sanitizeString(
    election.county.name,
    WORD_SEPARATOR
  )
  const electionTitle = sanitizeString(election.title, WORD_SEPARATOR)
  return `${electionCountyName}${SUBSECTION_SEPARATOR}${electionTitle}`
}

export function generateFilenameForBallotExportPackage(
  electionDefinition: ElectionDefinition,
  time: Date = new Date()
): string {
  const { election, electionHash } = electionDefinition
  const electionName = generateElectionName(election)
  const electionInformation = `${electionName}${SUBSECTION_SEPARATOR}${electionHash.slice(
    0,
    10
  )}`
  const timeInformation = moment(time).format(TIME_FORMAT_STRING)
  return `${electionInformation}${SECTION_SEPARATOR}${timeInformation}.zip`
}

export function generateElectionBasedSubfolderName(
  election: Election,
  electionHash: string
): string {
  const electionCountyName = sanitizeString(
    election.county.name,
    WORD_SEPARATOR
  )
  const electionTitle = sanitizeString(election.title, WORD_SEPARATOR)
  return `${`${electionCountyName}${SUBSECTION_SEPARATOR}${electionTitle}`.toLocaleLowerCase()}${SUBSECTION_SEPARATOR}${electionHash.slice(
    0,
    10
  )}`
}

export function parseCVRFileInfoFromFilename(
  filename: string
): CVRFileData | undefined {
  const segments = filename.split(SECTION_SEPARATOR)
  const isTestModeResults = segments.length === 4 && segments[0] === 'TEST'

  const postTestPrefixSegments = isTestModeResults
    ? segments.slice(1)
    : segments
  if (postTestPrefixSegments.length !== 3) {
    return
  }

  const machineSegments = postTestPrefixSegments[0].split(SUBSECTION_SEPARATOR)
  if (machineSegments.length !== 2 || machineSegments[0] !== 'machine') {
    return
  }
  const machineId = machineSegments[1]

  const ballotSegments = postTestPrefixSegments[1].split(SUBSECTION_SEPARATOR)
  if (ballotSegments.length !== 2 || ballotSegments[1] !== 'ballots') {
    return
  }
  const numberOfBallots = Number(ballotSegments[0])

  const parsedTime = moment(postTestPrefixSegments[2], TIME_FORMAT_STRING)
  return {
    machineId,
    numberOfBallots,
    isTestModeResults,
    timestamp: parsedTime.toDate(),
  }
}

export function generateFinalExportDefaultFilename(
  isTestModeResults: boolean,
  election: Election,
  time: Date = new Date()
): string {
  const filemode = isTestModeResults ? 'test' : 'live'
  const timeInformation = moment(time).format(TIME_FORMAT_STRING)
  const electionName = generateElectionName(election)
  return `votingworks${WORD_SEPARATOR}${filemode}${WORD_SEPARATOR}results${SUBSECTION_SEPARATOR}${electionName}${SUBSECTION_SEPARATOR}${timeInformation}.csv`
}
