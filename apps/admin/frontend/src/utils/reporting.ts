import { Admin, Election, Tabulation } from '@votingworks/types';
import { find, throwIllegalValue } from '@votingworks/basics';
import {
  TEST_FILE_PREFIX,
  sanitizeStringForFilename,
  isFilterEmpty as isTabulationFilterEmpty,
  generateFileTimeSuffix,
} from '@votingworks/utils';

const FAT_FILENAME_CHAR_LIMIT = 255;

export function isFilterEmpty(filter: Admin.FrontendReportingFilter): boolean {
  return (
    isTabulationFilterEmpty(filter) &&
    !filter.adjudicationFlags &&
    !filter.districtIds
  );
}

/**
 * Checks whether the report has any filters which have multiple values selected.
 */
function isCompoundFilter(filter: Admin.FrontendReportingFilter): boolean {
  return Boolean(
    (filter.partyIds && filter.partyIds.length > 1) ||
      (filter.ballotStyleGroupIds && filter.ballotStyleGroupIds.length > 1) ||
      (filter.precinctIds && filter.precinctIds.length > 1) ||
      (filter.batchIds && filter.batchIds.length > 1) ||
      (filter.scannerIds && filter.scannerIds.length > 1) ||
      (filter.votingMethods && filter.votingMethods.length > 1) ||
      (filter.adjudicationFlags && filter.adjudicationFlags.length > 1) ||
      (filter.districtIds && filter.districtIds.length > 1)
  );
}

/**
 * Returns the number of dimensions being filtered on.
 */
function getFilterRank(filter: Admin.FrontendReportingFilter): number {
  return (
    (filter.ballotStyleGroupIds?.[0] ? 1 : 0) +
    (filter.precinctIds?.[0] ? 1 : 0) +
    (filter.batchIds?.[0] ? 1 : 0) +
    (filter.scannerIds?.[0] ? 1 : 0) +
    (filter.votingMethods?.[0] ? 1 : 0) +
    (filter.partyIds?.[0] ? 1 : 0) +
    (filter.adjudicationFlags?.[0] ? 1 : 0) +
    (filter.districtIds?.[0] ? 1 : 0)
  );
}

/**
 * Canonicalize a user-provided filter to a canonical filter to prevent unnecessary changes
 * to the rendered report and reload from cache more often.
 * - ignores empty filters
 * - sorts filter values alphabetically
 */
export function canonicalizeFilter(
  filter: Admin.FrontendReportingFilter
): Admin.FrontendReportingFilter {
  return {
    ballotStyleGroupIds:
      filter.ballotStyleGroupIds && filter.ballotStyleGroupIds.length > 0
        ? [...filter.ballotStyleGroupIds].sort()
        : undefined,
    partyIds:
      filter.partyIds && filter.partyIds.length > 0
        ? [...filter.partyIds].sort()
        : undefined,
    precinctIds:
      filter.precinctIds && filter.precinctIds.length > 0
        ? [...filter.precinctIds].sort()
        : undefined,
    scannerIds:
      filter.scannerIds && filter.scannerIds.length > 0
        ? [...filter.scannerIds].sort()
        : undefined,
    batchIds:
      filter.batchIds && filter.batchIds.length > 0
        ? [...filter.batchIds].sort()
        : undefined,
    votingMethods:
      filter.votingMethods && filter.votingMethods.length > 0
        ? [...filter.votingMethods].sort()
        : undefined,
    adjudicationFlags:
      filter.adjudicationFlags && filter.adjudicationFlags.length > 0
        ? [...filter.adjudicationFlags].sort()
        : undefined,
    districtIds:
      filter.districtIds && filter.districtIds.length > 0
        ? [...filter.districtIds].sort()
        : undefined,
  };
}

export function canonicalizeGroupBy(
  groupBy: Tabulation.GroupBy
): Tabulation.GroupBy {
  return {
    groupByBallotStyle: groupBy.groupByBallotStyle ?? false,
    groupByParty: groupBy.groupByParty ?? false,
    groupByPrecinct: groupBy.groupByPrecinct ?? false,
    groupByScanner: groupBy.groupByScanner ?? false,
    groupByVotingMethod: groupBy.groupByVotingMethod ?? false,
    groupByBatch: groupBy.groupByBatch ?? false,
  };
}

const SECTION_SEPARATOR = '__';
const WORD_SEPARATOR = '-';

function generateReportFilenameFilterPrefix({
  election,
  filter,
}: {
  election: Election;
  filter: Admin.FrontendReportingFilter;
}): string {
  if (isCompoundFilter(filter)) {
    return 'custom';
  }

  const filterRank = getFilterRank(filter);

  // Full Election Tally Report
  if (filterRank === 0) {
    return '';
  }

  if (filterRank > 2) {
    return 'custom';
  }

  const filterPrefixes: string[] = [];

  const ballotStyleId = filter.ballotStyleGroupIds?.[0];
  const precinctId = filter.precinctIds?.[0];
  const votingMethod = filter.votingMethods?.[0];
  const scannerId = filter.scannerIds?.[0];
  const batchId = filter.batchIds?.[0];
  const adjudicationFlag = filter.adjudicationFlags?.[0];
  const districtId = filter.districtIds?.[0];

  if (ballotStyleId) {
    filterPrefixes.push(`ballot-style-${ballotStyleId}`);
  }

  if (precinctId) {
    const precinctName = find(
      election.precincts,
      (p) => p.id === precinctId
    ).name;
    filterPrefixes.push(
      sanitizeStringForFilename(precinctName, {
        replaceInvalidCharsWith: WORD_SEPARATOR,
      })
    );
  }

  if (districtId) {
    const districtName = find(
      election.districts,
      (d) => d.id === districtId
    ).name;
    filterPrefixes.push(
      sanitizeStringForFilename(districtName, {
        replaceInvalidCharsWith: WORD_SEPARATOR,
      })
    );
  }

  if (votingMethod) {
    filterPrefixes.push(`${votingMethod}-ballots`);
  }

  if (scannerId) {
    filterPrefixes.push(`scanner-${scannerId}`);
  }

  if (batchId) {
    filterPrefixes.push(
      `batch-${batchId.slice(0, Tabulation.BATCH_ID_DISPLAY_LENGTH)}`
    );
  }

  if (adjudicationFlag) {
    switch (adjudicationFlag) {
      case 'isBlank':
        filterPrefixes.push(`blank`);
        break;
      case 'hasOvervote':
        filterPrefixes.push(`overvoted`);
        break;
      case 'hasUndervote':
        filterPrefixes.push(`undervoted`);
        break;
      case 'hasWriteIn':
        filterPrefixes.push(`write-in`);
        break;
      // istanbul ignore next
      default:
        throwIllegalValue(adjudicationFlag);
    }
  }

  return filterPrefixes.join(WORD_SEPARATOR);
}

function generateReportFilenameGroupByPostfix({
  groupBy,
}: {
  groupBy: Tabulation.GroupBy;
}): string {
  const postfixes: string[] = [];

  if (groupBy.groupByBallotStyle) {
    postfixes.push('ballot-style');
  }

  if (groupBy.groupByParty) {
    postfixes.push('party');
  }

  if (groupBy.groupByPrecinct) {
    postfixes.push('precinct');
  }

  if (groupBy.groupByScanner) {
    postfixes.push('scanner');
  }

  if (groupBy.groupByVotingMethod) {
    postfixes.push('voting-method');
  }

  if (groupBy.groupByBatch) {
    postfixes.push('batch');
  }

  return postfixes.join(`${WORD_SEPARATOR}and${WORD_SEPARATOR}`);
}

export function generateReportFilename({
  election,
  filter,
  groupBy,
  isTestMode,
  isOfficialResults,
  extension,
  type: typeSingular,
  typePlural,
  time,
}: {
  election: Election;
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  isTestMode: boolean;
  isOfficialResults: boolean;
  extension: string;
  type: string;
  typePlural?: string;
  time: Date;
}): string {
  const descriptionFilterPrefix = generateReportFilenameFilterPrefix({
    election,
    filter,
  });
  const descriptionGroupByPostfix = generateReportFilenameGroupByPostfix({
    groupBy,
  });

  const descriptionParts: string[] = [];
  // description could be too long for the FAT filename limit of 255 characters
  // so we also generate a short description
  const shortDescriptionParts: string[] = [];

  if (isTestMode) {
    descriptionParts.push(TEST_FILE_PREFIX);
    shortDescriptionParts.push(TEST_FILE_PREFIX);
  }

  const officiality = isOfficialResults ? 'official' : 'unofficial';
  descriptionParts.push(officiality);
  shortDescriptionParts.push(officiality);

  if (descriptionFilterPrefix) {
    descriptionParts.push(descriptionFilterPrefix);
    shortDescriptionParts.push('custom');
  } else if (!descriptionGroupByPostfix) {
    descriptionParts.push('full-election');
  }

  const type =
    descriptionGroupByPostfix && typePlural ? typePlural : typeSingular;
  descriptionParts.push(type);
  shortDescriptionParts.push(type);

  if (descriptionGroupByPostfix) {
    descriptionParts.push('by');
    descriptionParts.push(descriptionGroupByPostfix);
  }

  const description = descriptionParts.join(WORD_SEPARATOR);
  const timeSuffix = generateFileTimeSuffix(time);
  const filename = `${[description, timeSuffix].join(
    SECTION_SEPARATOR
  )}.${extension}`;

  if (filename.length <= FAT_FILENAME_CHAR_LIMIT) {
    return filename;
  }

  // FAT32 has a 255 character limit on filenames
  const shortDescription = shortDescriptionParts.join(WORD_SEPARATOR);
  const shortFilename = `${[shortDescription, timeSuffix].join(
    SECTION_SEPARATOR
  )}.${extension}`;
  return shortFilename;
}

export function generateTallyReportPdfFilename({
  election,
  filter,
  groupBy,
  isTestMode,
  isOfficialResults,
  time = new Date(),
}: {
  election: Election;
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  isTestMode: boolean;
  isOfficialResults: boolean;
  time?: Date;
}): string {
  return generateReportFilename({
    election,
    filter,
    groupBy,
    isTestMode,
    isOfficialResults,
    extension: 'pdf',
    type: 'tally-report',
    typePlural: 'tally-reports',
    time,
  });
}

export function generateTallyReportCsvFilename({
  election,
  filter,
  groupBy,
  isTestMode,
  isOfficialResults,
  time = new Date(),
}: {
  election: Election;
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  isTestMode: boolean;
  isOfficialResults: boolean;
  time?: Date;
}): string {
  return generateReportFilename({
    election,
    filter,
    groupBy,
    isTestMode,
    isOfficialResults,
    extension: 'csv',
    type: 'tally-report',
    time,
  });
}

export function generateBallotCountReportPdfFilename({
  election,
  filter,
  groupBy,
  isTestMode,
  isOfficialResults,
  time = new Date(),
}: {
  election: Election;
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  isTestMode: boolean;
  isOfficialResults: boolean;
  time?: Date;
}): string {
  return generateReportFilename({
    election,
    filter,
    groupBy,
    isTestMode,
    isOfficialResults,
    extension: 'pdf',
    type: 'ballot-count-report',
    time,
  });
}

export function generateBallotCountReportCsvFilename({
  election,
  filter,
  groupBy,
  isTestMode,
  isOfficialResults,
  time = new Date(),
}: {
  election: Election;
  filter: Admin.FrontendReportingFilter;
  groupBy: Tabulation.GroupBy;
  isTestMode: boolean;
  isOfficialResults: boolean;
  time?: Date;
}): string {
  return generateReportFilename({
    election,
    filter,
    groupBy,
    isTestMode,
    isOfficialResults,
    extension: 'csv',
    type: 'ballot-count-report',
    time,
  });
}

export function generateCdfElectionResultsReportFilename({
  isTestMode,
  isOfficialResults,
  time,
}: {
  isTestMode: boolean;
  isOfficialResults: boolean;
  time?: Date;
}): string {
  const descriptionParts: string[] = [];

  if (isTestMode) {
    descriptionParts.push(TEST_FILE_PREFIX);
  }

  const officiality = isOfficialResults ? 'official' : 'unofficial';
  descriptionParts.push(officiality);

  descriptionParts.push('cdf-election-results-report');
  const description = descriptionParts.join(WORD_SEPARATOR);
  const timeSuffix = generateFileTimeSuffix(time);

  return `${description}${SECTION_SEPARATOR}${timeSuffix}.json`;
}
