import moment from 'moment'

import { ElectionDefinition } from '../config/types'

const SECTION_SEPARATOR = '__'
const SUBSECTION_SEPARATOR = '_'
const WORD_SEPARATOR = '-'
const TIME_FORMAT_STRING = `YYYY${WORD_SEPARATOR}MM${WORD_SEPARATOR}DD${SUBSECTION_SEPARATOR}HH${WORD_SEPARATOR}mm${WORD_SEPARATOR}ss`

function sanitizeString(input: string): string {
  return input
    .replace(/[^a-z0-9]+/gi, WORD_SEPARATOR)
    .replace(/(^-|-$)+/g, '')
    .toLocaleLowerCase()
}

export const BALLOT_PACKAGES_FOLDER = 'ballot-packages'

export function generateFilenameForBallotExportPackage(
  electionDefinition: ElectionDefinition,
  time: Date = new Date()
): string {
  const { election, electionHash } = electionDefinition
  const electionCountyName = sanitizeString(election.county.name)
  const electionTitle = sanitizeString(election.title)
  const electionInformation = `${electionCountyName}${SUBSECTION_SEPARATOR}${electionTitle}${SUBSECTION_SEPARATOR}${electionHash.slice(
    0,
    10
  )}`
  const timeInformation = moment(time).format(TIME_FORMAT_STRING)
  return `${electionInformation}${SECTION_SEPARATOR}${timeInformation}.zip`
}
