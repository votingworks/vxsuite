import moment from 'moment'

import { ElectionDefinition } from '../config/types'

const SECTION_SEPERATOR = '__'
const SUBSECTION_SEPERATOR = '_'
const WORD_SEPERATOR = '-'
const TIME_FORMAT_STRING = `YYYY${WORD_SEPERATOR}MM${WORD_SEPERATOR}DD${SUBSECTION_SEPERATOR}HH${WORD_SEPERATOR}mm${WORD_SEPERATOR}ss`

// eslint-disable-next-line import/prefer-default-export
export function generateFilenameForBallotExportPackage(
  electionDefinition: ElectionDefinition,
  time: Date = new Date()
): string {
  const { election, electionHash } = electionDefinition
  const electionCountyName = election.county.name
    .replace(/[^a-z0-9]+/gi, WORD_SEPERATOR)
    .replace(/(^-|-$)+/g, '')
  const electionTitle = election.title
    .replace(/[^a-z0-9]+/gi, WORD_SEPERATOR)
    .replace(/(^-|-$)+/g, '')
  const electionInformation = `${`${electionCountyName}${SUBSECTION_SEPERATOR}${electionTitle}`.toLocaleLowerCase()}${SUBSECTION_SEPERATOR}${electionHash.slice(
    0,
    10
  )}`
  const timeInformation = moment(time).format(TIME_FORMAT_STRING)
  return `${electionInformation}${SECTION_SEPERATOR}${timeInformation}.zip`
}
