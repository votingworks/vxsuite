import { Election, MachineId, maybeParse } from '@votingworks/types';
import { assert, Optional, throwIllegalValue } from '@votingworks/basics';
import { DateTime } from 'luxon';

const SECTION_SEPARATOR = '__';
const SUBSECTION_SEPARATOR = '_';
const WORD_SEPARATOR = '-';
const TIME_FORMAT_STRING = `yyyy${WORD_SEPARATOR}MM${WORD_SEPARATOR}dd${SUBSECTION_SEPARATOR}HH${WORD_SEPARATOR}mm${WORD_SEPARATOR}ss`;

export const ELECTION_PACKAGE_FOLDER = 'election-packages';
export const SCANNER_RESULTS_FOLDER = 'cast-vote-records';
export const SCANNER_BACKUPS_FOLDER = 'scanner-backups';
export const REPORT_FOLDER = 'reports';
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
  ballotHash: string
): string {
  const electionCountyName = sanitizeStringForFilename(election.county.name, {
    replaceInvalidCharsWith: WORD_SEPARATOR,
    defaultValue: 'county',
  });
  const electionTitle = sanitizeStringForFilename(election.title, {
    replaceInvalidCharsWith: WORD_SEPARATOR,
    defaultValue: 'election',
  });
  return `${`${electionCountyName}${SUBSECTION_SEPARATOR}${electionTitle}`.toLocaleLowerCase()}${SUBSECTION_SEPARATOR}${ballotHash.slice(
    0,
    10
  )}`;
}

export function generateFileTimeSuffix(time: Date = new Date()): string {
  return DateTime.fromJSDate(time).toFormat(TIME_FORMAT_STRING);
}

/* Generate the name for an election package */
export function generateFilenameForElectionPackage(
  time: Date = new Date()
): string {
  const timeSuffix = generateFileTimeSuffix(time);
  return `election-package${SECTION_SEPARATOR}${timeSuffix}.zip`;
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
  const timeSuffix = generateFileTimeSuffix(time);
  switch (fileType) {
    case LogFileType.Raw:
      return `${logFileName}${SUBSECTION_SEPARATOR}${timeSuffix}.log`;
    case LogFileType.Cdf:
      return `${logFileName}${WORD_SEPARATOR}cdf${SUBSECTION_SEPARATOR}${timeSuffix}.json`;
    /* istanbul ignore next */
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
  const timeSuffix = generateFileTimeSuffix(time);
  const directoryNameComponents = [machineString, timeSuffix];
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
  const dateTime = DateTime.fromFormat(timeString, TIME_FORMAT_STRING);
  if (!dateTime.isValid) {
    return;
  }
  const time = dateTime.toJSDate();

  return {
    inTestMode,
    machineId,
    time,
  };
}

export function generateReadinessReportFilename({
  machineId,
  generatedAtTime,
}: {
  machineId: string;
  generatedAtTime: Date;
}): string {
  return `readiness-report__${machineId}__${generateFileTimeSuffix(
    generatedAtTime
  )}.pdf`;
}
