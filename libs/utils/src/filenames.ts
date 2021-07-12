import moment from 'moment'
import { Election, ElectionDefinition } from '@votingworks/types'

const SECTION_SEPARATOR = '__'
const SUBSECTION_SEPARATOR = '_'
const WORD_SEPARATOR = '-'
const TIME_FORMAT_STRING = `YYYY${WORD_SEPARATOR}MM${WORD_SEPARATOR}DD${SUBSECTION_SEPARATOR}HH${WORD_SEPARATOR}mm${WORD_SEPARATOR}ss`

export const BALLOT_PACKAGE_FOLDER = 'ballot-packages'
export const SCANNER_RESULTS_FOLDER = 'cast-vote-records'
export const SCANNER_BACKUPS_FOLDER = 'scanner-backups'

export type ElectionData = {
  electionCounty: string
  electionName: string
  electionHash: string
  timestamp: Date
}

export type CVRFileData = {
  machineId: string
  numberOfBallots: number
  isTestModeResults: boolean
  timestamp: Date
}

function sanitizeString(input: string, replacementString = ''): string {
  return input
    .replace(/[^a-z0-9]+/gi, replacementString)
    .replace(/(^-|-$)+/g, '')
    .toLocaleLowerCase()
}

/**
 * Convert an auto-generated name of the ballot configuration package zip archive
 * to the pieces of data contained in the name.
 */
export function parseBallotExportPackageInfoFromFilename(
  filename: string
): ElectionData | undefined {
  // There should be two underscores separating the timestamp from the election information
  const segments = filename.split(SECTION_SEPARATOR)
  if (segments.length !== 2) {
    return
  }

  const [electionString, timeString] = segments

  let electionSegments = electionString!.split(SUBSECTION_SEPARATOR)
  if (electionSegments.length !== 3) {
    return
  }
  electionSegments = electionSegments.map((s) => s.replace(/-/g, ' '))
  const [electionCounty, electionName, electionHash] = electionSegments

  const parsedTime = moment(timeString, TIME_FORMAT_STRING)
  return {
    electionCounty: electionCounty!,
    electionName: electionName!,
    electionHash: electionHash!,
    timestamp: parsedTime.toDate(),
  }
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

/**
 * Generate the filename for the scanning results CVR file
 */
export function generateFilenameForScanningResults(
  machineId: string,
  numBallotsScanned: number,
  isTestMode: boolean,
  time: Date = new Date()
): string {
  const machineString = `machine${SUBSECTION_SEPARATOR}${sanitizeString(
    machineId
  )}`
  const ballotString = `${numBallotsScanned}${SUBSECTION_SEPARATOR}ballots`
  const timeInformation = moment(time).format(TIME_FORMAT_STRING)
  const filename = `${machineString}${SECTION_SEPARATOR}${ballotString}${SECTION_SEPARATOR}${timeInformation}.jsonl`
  return isTestMode ? `TEST${SECTION_SEPARATOR}${filename}` : filename
}

/* Extract information about a CVR file from the filename */
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

  const machineSegments = postTestPrefixSegments[0]!.split(SUBSECTION_SEPARATOR)
  if (machineSegments.length !== 2 || machineSegments[0] !== 'machine') {
    return
  }
  const machineId = machineSegments[1]

  const ballotSegments = postTestPrefixSegments[1]!.split(SUBSECTION_SEPARATOR)
  if (ballotSegments.length !== 2 || ballotSegments[1] !== 'ballots') {
    return
  }
  const numberOfBallots = Number(ballotSegments[0])

  const parsedTime = moment(postTestPrefixSegments[2], TIME_FORMAT_STRING)
  return {
    machineId: machineId!,
    numberOfBallots,
    isTestModeResults,
    timestamp: parsedTime.toDate(),
  }
}

/* Get the name of an election to use in a filename from the Election object */
function generateElectionName(election: Election): string {
  const electionCountyName = sanitizeString(
    election.county.name,
    WORD_SEPARATOR
  )
  const electionTitle = sanitizeString(election.title, WORD_SEPARATOR)
  return `${electionCountyName}${SUBSECTION_SEPARATOR}${electionTitle}`
}

/* Generate the name for a ballot export package */
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

/* Generate the filename for final results export from election manager */
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
