import {
  ElectionDefinition,
  formatBallotHash,
  safeParseInt,
  Tabulation,
} from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  assert,
  assertDefined,
  deepEqual,
  err,
  find,
  groupBy,
  iter,
  lines,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { MS_ID_SEPARATOR } from './convert_ms_election';

const ALL_PRECINCTS_TALLY_REPORT_COLUMNS = [
  { name: 'Precinct', key: 'precinct' },
  { name: 'Precinct ID', key: 'precinctId' },
  { name: 'Contest', key: 'contest' },
  { name: 'Contest ID', key: 'contestId' },
  { name: 'Selection', key: 'selection' },
  { name: 'Selection ID', key: 'selectionId' },
  { name: 'Total Votes', key: 'totalVotes' },
] as const;

const ALL_PRECINCTS_TALLY_REPORT_COLUMNS_WITH_MANUAL_TALLIES = [
  { name: 'Precinct', key: 'precinct' },
  { name: 'Precinct ID', key: 'precinctId' },
  { name: 'Contest', key: 'contest' },
  { name: 'Contest ID', key: 'contestId' },
  { name: 'Selection', key: 'selection' },
  { name: 'Selection ID', key: 'selectionId' },
  { name: 'Manual Votes', key: 'manualVotes' },
  { name: 'Scanned Votes', key: 'scannedVotes' },
  { name: 'Total Votes', key: 'totalVotes' },
] as const;

export type AllPrecinctsTallyReportRow = {
  [K in (typeof ALL_PRECINCTS_TALLY_REPORT_COLUMNS)[number]['key']]: string;
};

export type AllPrecinctsTallyReportRowWithManualTallies = {
  [K in (typeof ALL_PRECINCTS_TALLY_REPORT_COLUMNS_WITH_MANUAL_TALLIES)[number]['key']]: string;
};

export const SEMS_RESULTS_COLUMNS = [
  'countyId',
  'precinctId',
  'contestId',
  'contestTitle',
  'partyId',
  'partyLabel',
  /**
   * Either a candidate/option ID or a code:
   * - 0 indicates write-ins
   * - 1 indicates overvotes
   * - 2 indicates undervotes
   */
  'candidateId',
  'candidateName',
  'candidatePartyId',
  'candidatePartyLabel',
  'voteCount',
] as const;

export type SemsResultsRow = {
  [K in (typeof SEMS_RESULTS_COLUMNS)[number]]: string;
};

const NONPARTISAN_PARTY_ID = '0';
const NONPARTISAN_PARTY_LABEL = 'NP';

export type ConvertMsResultsError =
  | 'wrong-election'
  | 'wrong-tally-report'
  | 'invalid-headers'
  | 'report-precincts-mismatch'
  | 'report-contests-mismatch';

export function convertMsResults(
  electionDefinition: ElectionDefinition,
  allPrecinctsTallyReportContents: string
): Result<string, ConvertMsResultsError> {
  const { election, ballotHash } = electionDefinition;

  const [reportTitle, reportElectionId] = assertDefined(
    lines(allPrecinctsTallyReportContents).first()
  ).split(',');
  const [, reportBallotHash] =
    reportElectionId.match(/^Election ID: (.+)$/) ?? [];
  if (
    !/^(?:TEST-)?(?:official|unofficial)-tally-report-by-precinct$/.test(
      reportTitle
    )
  ) {
    return err('wrong-tally-report');
  }
  if (reportBallotHash !== formatBallotHash(ballotHash)) {
    return err('wrong-election');
  }

  let allPrecinctsTallyReportRows:
    | AllPrecinctsTallyReportRow[]
    | AllPrecinctsTallyReportRowWithManualTallies[];
  try {
    allPrecinctsTallyReportRows = parse(allPrecinctsTallyReportContents, {
      fromLine: 2,
      columns: (headers) => {
        for (const validColumnConfig of [
          ALL_PRECINCTS_TALLY_REPORT_COLUMNS,
          ALL_PRECINCTS_TALLY_REPORT_COLUMNS_WITH_MANUAL_TALLIES,
        ]) {
          if (
            deepEqual(
              headers,
              validColumnConfig.map((c) => c.name)
            )
          ) {
            return validColumnConfig.map((c) => c.key);
          }
        }
        throw new Error('invalid-headers');
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid-headers') {
      return err('invalid-headers');
    }
    throw error;
  }

  // Validate that we have the right report (i.e. that all precincts and contests
  // in the election are present)
  const reportPrecinctIds = new Set(
    allPrecinctsTallyReportRows.map((row) => row.precinctId)
  );
  const electionPrecinctIds = new Set(
    election.precincts.map((precinct) => precinct.id)
  );
  if (!deepEqual(reportPrecinctIds, electionPrecinctIds)) {
    return err('report-precincts-mismatch');
  }
  const reportContestIds = new Set(
    allPrecinctsTallyReportRows.map((row) => row.contestId)
  );
  const electionContestIds = new Set(
    election.contests.map((contest) => contest.id)
  );
  if (!deepEqual(reportContestIds, electionContestIds)) {
    return err('report-contests-mismatch');
  }

  function extractSemsId(id: string): string {
    const [electionId, semsId] = id.split(MS_ID_SEPARATOR);
    assert(electionId === election.id);
    return semsId;
  }

  function isWriteIn(row: AllPrecinctsTallyReportRow): boolean {
    return (
      row.selectionId === Tabulation.GENERIC_WRITE_IN_ID ||
      // Adjudicated write-ins have a new UUID as their selection ID
      // and have "(Write-In)" appended to their selection name
      (!row.selectionId.startsWith(election.id + MS_ID_SEPARATOR) &&
        row.selectionId !== 'overvotes' &&
        row.selectionId !== 'undervotes' &&
        row.selection.endsWith('(Write-In)'))
    );
  }

  const resultsRows = groupBy(
    allPrecinctsTallyReportRows,
    // Aggregate write-in vote counts within each precinct+contest
    (row) => [
      row.precinctId,
      row.contestId,
      isWriteIn(row) ? Tabulation.GENERIC_WRITE_IN_ID : row.selectionId,
    ]
  )
    .map(
      ([[, , selectionId], rowGroup]): AllPrecinctsTallyReportRow => ({
        ...assertDefined(rowGroup[0]),
        selectionId,
        totalVotes: String(
          iter(rowGroup)
            .map((row) => safeParseInt(row.totalVotes).unsafeUnwrap())
            .sum()
        ),
      })
    )
    // Convert to SemsResultsRow
    .map((row): SemsResultsRow => {
      const contest = find(election.contests, (c) => c.id === row.contestId);
      const party =
        contest.type === 'candidate' && contest.partyId
          ? find(election.parties, (p) => p.id === contest.partyId)
          : undefined;

      const selectionColumns = (() => {
        if (row.selectionId === 'overvotes') {
          return {
            candidateId: '1',
            candidateName: 'Times Over Voted',
            candidatePartyId: NONPARTISAN_PARTY_ID,
            candidatePartyLabel: NONPARTISAN_PARTY_LABEL,
          };
        }
        if (row.selectionId === 'undervotes') {
          return {
            candidateId: '2',
            candidateName: 'Times Under Voted',
            candidatePartyId: NONPARTISAN_PARTY_ID,
            candidatePartyLabel: NONPARTISAN_PARTY_LABEL,
          };
        }
        switch (contest.type) {
          case 'candidate': {
            if (row.selectionId === Tabulation.GENERIC_WRITE_IN_ID) {
              return {
                candidateId: '0',
                candidateName: 'Write-in',
                candidatePartyId: NONPARTISAN_PARTY_ID,
                candidatePartyLabel: NONPARTISAN_PARTY_LABEL,
              };
            }
            const candidate = find(
              contest.candidates,
              (c) => c.id === row.selectionId
            );
            const candidateParty =
              candidate.partyIds && candidate.partyIds.length > 0
                ? find(
                    election.parties,
                    (p) => p.id === assertDefined(candidate.partyIds)[0]
                  )
                : undefined;
            return {
              candidateId: extractSemsId(candidate.id),
              candidateName: candidate.name,
              candidatePartyId: candidateParty
                ? extractSemsId(candidateParty.id)
                : NONPARTISAN_PARTY_ID,
              candidatePartyLabel: candidateParty
                ? candidateParty.abbrev
                : NONPARTISAN_PARTY_LABEL,
            };
          }
          case 'yesno': {
            const option = assertDefined(
              row.selectionId === contest.yesOption.id
                ? contest.yesOption
                : row.selectionId === contest.noOption.id
                ? contest.noOption
                : undefined
            );
            return {
              candidateId: extractSemsId(option.id),
              candidateName: option.label,
              candidatePartyId: NONPARTISAN_PARTY_ID,
              candidatePartyLabel: NONPARTISAN_PARTY_LABEL,
            };
          }
          default: {
            /* istanbul ignore next - @preserve */
            throwIllegalValue(contest);
          }
        }
      })();

      return {
        countyId: extractSemsId(election.county.id),
        precinctId: extractSemsId(row.precinctId),
        contestId: extractSemsId(contest.id),
        contestTitle: contest.title,
        partyId: party ? extractSemsId(party.id) : NONPARTISAN_PARTY_ID,
        partyLabel: party ? party.abbrev : NONPARTISAN_PARTY_LABEL,
        ...selectionColumns,
        voteCount: row.totalVotes,
      };
    });

  return ok(
    stringify(resultsRows, {
      // SEMS results files don't have headers, so make sure we get the columns in
      // the right order.
      columns: SEMS_RESULTS_COLUMNS,
      quoted: true,
      recordDelimiter: ',\r\n',
    }).trimEnd()
  );
}
