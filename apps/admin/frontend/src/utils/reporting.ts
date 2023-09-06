import { Election, ElectionDefinition, Tabulation } from '@votingworks/types';
import { Optional, Result, err, find, ok } from '@votingworks/basics';
import { getPrecinctById, sanitizeStringForFilename } from '@votingworks/utils';
import moment from 'moment';

const VOTING_METHOD_LABELS: Record<Tabulation.VotingMethod, string> = {
  absentee: 'Absentee',
  precinct: 'Precinct',
  provisional: 'Provisional',
};

/**
 * Checks whether the report has any filters which have multiple values selected.
 */
function isCompoundFilter(filter: Tabulation.Filter): boolean {
  return Boolean(
    (filter.partyIds && filter.partyIds.length > 1) ||
      (filter.ballotStyleIds && filter.ballotStyleIds.length > 1) ||
      (filter.precinctIds && filter.precinctIds.length > 1) ||
      (filter.batchIds && filter.batchIds.length > 1) ||
      (filter.scannerIds && filter.scannerIds.length > 1) ||
      (filter.votingMethods && filter.votingMethods.length > 1)
  );
}

/**
 * Returns the number of dimensions being filtered on.
 */
function getFilterRank(filter: Tabulation.Filter): number {
  return (
    (filter.ballotStyleIds?.[0] ? 1 : 0) +
    (filter.precinctIds?.[0] ? 1 : 0) +
    (filter.batchIds?.[0] ? 1 : 0) +
    (filter.scannerIds?.[0] ? 1 : 0) +
    (filter.votingMethods?.[0] ? 1 : 0) +
    (filter.partyIds?.[0] ? 1 : 0)
  );
}

/**
 * Attempts to generate a title for an individual tally report based on its filter.
 */
export function generateTitleForReport({
  filter,
  electionDefinition,
}: {
  filter: Tabulation.Filter;
  electionDefinition: ElectionDefinition;
}): Result<Optional<string>, 'title-not-supported'> {
  if (isCompoundFilter(filter)) {
    return err('title-not-supported');
  }

  const ballotStyleId = filter.ballotStyleIds?.[0];
  const precinctId = filter.precinctIds?.[0];
  const votingMethod = filter.votingMethods?.[0];

  const reportRank = getFilterRank(filter);

  // Full Election Tally Report
  if (reportRank === 0) {
    return ok(undefined);
  }

  if (reportRank === 1) {
    if (precinctId) {
      return ok(
        `${getPrecinctById(electionDefinition, precinctId).name} Tally Report`
      );
    }

    if (ballotStyleId) {
      return ok(`Ballot Style ${ballotStyleId} Tally Report`);
    }

    if (votingMethod) {
      return ok(`${VOTING_METHOD_LABELS[votingMethod]} Ballot Tally Report`);
    }
  }

  if (reportRank === 2) {
    if (precinctId && votingMethod) {
      return ok(
        `${getPrecinctById(electionDefinition, precinctId).name} ${
          VOTING_METHOD_LABELS[votingMethod]
        } Ballot Tally Report`
      );
    }

    if (ballotStyleId && votingMethod) {
      return ok(
        `Ballot Style ${ballotStyleId} ${VOTING_METHOD_LABELS[votingMethod]} Ballot Tally Report`
      );
    }

    if (precinctId && ballotStyleId) {
      return ok(
        `Ballot Style ${ballotStyleId} ${
          getPrecinctById(electionDefinition, precinctId).name
        } Tally Report`
      );
    }
  }

  return err('title-not-supported');
}

/**
 * Canonicalize a user-provided filter to a canonical filter to prevent unnecessary changes
 * to the rendered report and reload from cache more often.
 * - ignores empty filters
 * - sorts filter values alphabetically
 */
export function canonicalizeFilter(
  filter: Tabulation.Filter
): Tabulation.Filter {
  return {
    ballotStyleIds:
      filter.ballotStyleIds && filter.ballotStyleIds.length > 0
        ? [...filter.ballotStyleIds].sort()
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
const SUBSECTION_SEPARATOR = '_';
const TIME_FORMAT_STRING = `YYYY${WORD_SEPARATOR}MM${WORD_SEPARATOR}DD${SUBSECTION_SEPARATOR}HH${WORD_SEPARATOR}mm${WORD_SEPARATOR}ss`;

const TEST_MODE_PREFIX = 'TEST';

function generateReportFilenameFilterPrefix({
  election,
  filter,
}: {
  election: Election;
  filter: Tabulation.Filter;
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

  const ballotStyleId = filter.ballotStyleIds?.[0];
  const precinctId = filter.precinctIds?.[0];
  const votingMethod = filter.votingMethods?.[0];

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

  if (votingMethod) {
    filterPrefixes.push(`${votingMethod}-ballots`);
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

function generateReportFilename({
  election,
  filter,
  groupBy,
  isTestMode,
  extension,
  type: typeSingular,
  typePlural,
  time,
}: {
  election: Election;
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
  isTestMode: boolean;
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
  const shortDescriptionParts: string[] = []; // in case description is too long

  if (isTestMode) {
    descriptionParts.push(TEST_MODE_PREFIX);
    shortDescriptionParts.push(TEST_MODE_PREFIX);
  }

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
  const timestamp = moment(time).format(TIME_FORMAT_STRING);
  const filename = `${[description, timestamp].join(
    SECTION_SEPARATOR
  )}.${extension}`;

  if (filename.length <= 255) {
    return filename;
  }

  // FAT32 has a 255 character limit on filenames
  const shortDescription = shortDescriptionParts.join(WORD_SEPARATOR);
  const shortFilename = `${[shortDescription, timestamp].join(
    SECTION_SEPARATOR
  )}.${extension}`;
  return shortFilename;
}

export const REPORT_SUBFOLDER = 'reports';

export function generateTallyReportPdfFilename({
  election,
  filter,
  groupBy,
  isTestMode,
  time = new Date(),
}: {
  election: Election;
  filter: Tabulation.Filter;
  groupBy: Tabulation.GroupBy;
  isTestMode: boolean;
  time?: Date;
}): string {
  return generateReportFilename({
    election,
    filter,
    groupBy,
    isTestMode,
    extension: 'pdf',
    type: 'tally-report',
    typePlural: 'tally-reports',
    time,
  });
}
