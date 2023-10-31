import moment from 'moment';
import { Election, MachineId, maybeParse } from '@votingworks/types';
import { assert, Optional, throwIllegalValue } from '@votingworks/basics';

const SECTION_SEPARATOR = '__';
const SUBSECTION_SEPARATOR = '_';
const WORD_SEPARATOR = '-';
const TIME_FORMAT_STRING = `YYYY${WORD_SEPARATOR}MM${WORD_SEPARATOR}DD${SUBSECTION_SEPARATOR}HH${WORD_SEPARATOR}mm${WORD_SEPARATOR}ss`;

export const BALLOT_PACKAGE_FOLDER = 'ballot-packages';
export const SCANNER_RESULTS_FOLDER = 'cast-vote-records';
export const SCANNER_BACKUPS_FOLDER = 'scanner-backups';
export const TEST_FILE_PREFIX = 'TEST';

/**
 * @deprecated
 */
export const CAST_VOTE_RECORD_REPORT_FILENAME = 'cast-vote-record-report.json';

export interface CastVoteRecordReportListing {
  machineId: string;
  numberOfBallots: number;
  isTestModeResults: boolean;
  timestamp: Date;
}

export interface CastVoteRecordExportDirectoryNameComponents {
  inTestMode: boolean;
  machineId: string;
  time: Date;
}

export function sanitizeStringForFilename(
  input: string,
  { replaceInvalidCharsWith = '', defaultValue = 'placeholder' } = {}
): string {
  const sanitized = input
    .replace(/[^a-z0-9]+/gi, replaceInvalidCharsWith)
    .replace(/(^-|-$)+/g, '')
    .toLocaleLowerCase();
  return sanitized.trim().length === 0 ? defaultValue : sanitized;
}

export function generateElectionBasedSubfolderName(
  election: Election,
  electionHash: string
): string {
  const electionCountyName = sanitizeStringForFilename(election.county.name, {
    replaceInvalidCharsWith: WORD_SEPARATOR,
    defaultValue: 'county',
  });
  const electionTitle = sanitizeStringForFilename(election.title, {
    replaceInvalidCharsWith: WORD_SEPARATOR,
    defaultValue: 'election',
  });
  return `${`${electionCountyName}${SUBSECTION_SEPARATOR}${electionTitle}`.toLocaleLowerCase()}${SUBSECTION_SEPARATOR}${electionHash.slice(
    0,
    10
  )}`;
}

/* Get the name of an election to use in a filename from the Election object */
function generateElectionName(election: Election): string {
  const electionCountyName = sanitizeStringForFilename(election.county.name, {
    replaceInvalidCharsWith: WORD_SEPARATOR,
    defaultValue: 'county',
  });
  const electionTitle = sanitizeStringForFilename(election.title, {
    replaceInvalidCharsWith: WORD_SEPARATOR,
    defaultValue: 'election',
  });
  return `${electionCountyName}${SUBSECTION_SEPARATOR}${electionTitle}`;
}

/* Generate the name for a ballot export package */
export function generateFilenameForBallotExportPackage(
  time: Date = new Date()
): string {
  const timeInformation = moment(time).format(TIME_FORMAT_STRING);
  return `ballot-package${SECTION_SEPARATOR}${timeInformation}.zip`;
}

/* Generate the filename for final sems results export from election manager */
export function generateSemsFinalExportDefaultFilename(
  isTestModeResults: boolean,
  election: Election,
  time: Date = new Date()
): string {
  const filemode = isTestModeResults ? 'test' : 'live';
  const timeInformation = moment(time).format(TIME_FORMAT_STRING);
  const electionName = generateElectionName(election);
  return `votingworks${WORD_SEPARATOR}sems${WORD_SEPARATOR}${filemode}${WORD_SEPARATOR}results${SUBSECTION_SEPARATOR}${electionName}${SUBSECTION_SEPARATOR}${timeInformation}.txt`;
}

/* Describes different formats of the log file. */
export enum LogFileType {
  Raw = 'raw',
  Cdf = 'cdf',
}

/**
 * Generates a filename for the logs file.
 * @param logFileName Name of the log file being exported
 * @param time Optional for the time we are generating the filename, defaults to the current time.
 * @returns string filename i.e. "vx-logs_timestamp.log"
 */
export function generateLogFilename(
  logFileName: string,
  fileType: LogFileType,
  time: Date = new Date()
): string {
  const timeInformation = moment(time).format(TIME_FORMAT_STRING);
  switch (fileType) {
    case LogFileType.Raw:
      return `${logFileName}${SUBSECTION_SEPARATOR}${timeInformation}.log`;
    case LogFileType.Cdf:
      return `${logFileName}${WORD_SEPARATOR}cdf${SUBSECTION_SEPARATOR}${timeInformation}.json`;
    /* c8 ignore next 2 */
    default:
      throwIllegalValue(fileType);
  }
}

/**
 * Generates a name for a cast vote record export directory
 */
export function generateCastVoteRecordExportDirectoryName({
  inTestMode,
  machineId,
  time = new Date(),
}: Omit<CastVoteRecordExportDirectoryNameComponents, 'time'> & {
  time?: Date;
}): string {
  const machineString = [
    'machine',
    maybeParse(MachineId, machineId) ?? sanitizeStringForFilename(machineId),
  ].join(SUBSECTION_SEPARATOR);
  const timeString = moment(time).format(TIME_FORMAT_STRING);
  const directoryNameComponents = [machineString, timeString];
  if (inTestMode) {
    directoryNameComponents.unshift(TEST_FILE_PREFIX);
  }
  return directoryNameComponents.join(SECTION_SEPARATOR);
}

/**
 * Extracts information about a cast vote record export from the export directory name
 */
export function parseCastVoteRecordReportExportDirectoryName(
  exportDirectoryName: string
): Optional<CastVoteRecordExportDirectoryNameComponents> {
  const sections = exportDirectoryName.split(SECTION_SEPARATOR);
  const inTestMode = sections.length === 3 && sections[0] === TEST_FILE_PREFIX;
  const postTestPrefixSections = inTestMode ? sections.slice(1) : sections;
  if (postTestPrefixSections.length !== 2) {
    return;
  }
  assert(postTestPrefixSections[0] !== undefined);
  assert(postTestPrefixSections[1] !== undefined);

  const machineString = postTestPrefixSections[0];
  const machineSubsections = machineString.split(SUBSECTION_SEPARATOR);
  if (machineSubsections.length !== 2 || machineSubsections[0] !== 'machine') {
    return;
  }
  assert(machineSubsections[1] !== undefined);
  const machineId = machineSubsections[1];

  const timeString = postTestPrefixSections[1];
  const timeMoment = moment(timeString, TIME_FORMAT_STRING);
  if (!timeMoment.isValid()) {
    return;
  }
  const time = timeMoment.toDate();

  return {
    inTestMode,
    machineId,
    time,
  };
}
