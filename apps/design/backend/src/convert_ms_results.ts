import { Election, safeParseInt } from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  assert,
  assertDefined,
  find,
  iter,
  throwIllegalValue,
} from '@votingworks/basics';
import { MS_ID_SEPARATOR } from './convert_ms_election';

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replaceAll(/\s([a-z])/g, (_, firstChar) => firstChar.toUpperCase());
}

export interface AllPrecinctsTallyReportRow {
  precinct: string;
  precinctId: string;
  contest: string;
  contestId: string;
  selection: string;
  selectionId: string;
  totalVotes: string;
}

interface SemsResultsRow {
  countyId: string;
  precinctId: string;
  contestId: string;
  contestTitle: string;
  partyId: string;
  partyLabel: string;
  /**
   * Either a candidate/option ID or a code:
   * - 0 indicates write-ins
   * - 1 indicates overvotes
   * - 2 indicates undervotes
   */
  candidateId: string;
  candidateName: string;
  candidatePartyId: string;
  candidatePartyLabel: string;
  voteCount: string;
}

const NONPARTISAN_PARTY_ID = '0';
const NONPARTISAN_PARTY_LABEL = 'NP';

export function convertMsResults(
  election: Election,
  allPrecinctsTallyReportContents: string
): string {
  const allPrecinctsTallyReportRows: AllPrecinctsTallyReportRow[] = parse(
    allPrecinctsTallyReportContents,
    { columns: (headers) => headers.map(toCamelCase) }
  );

  function extractSemsId(id: string): string {
    const [electionId, semsId] = id.split(MS_ID_SEPARATOR);
    assert(electionId === election.id);
    return semsId;
  }

  const resultsRows = iter(allPrecinctsTallyReportRows)
    // Aggregate write-in vote counts within each precinct+contest
    .groupBy(
      (row1, row2) =>
        row1.precinctId === row2.precinctId &&
        row1.contestId === row2.contestId &&
        row1.selectionId.startsWith('write-in') &&
        row2.selectionId.startsWith('write-in')
    )
    .map((rowGroup): AllPrecinctsTallyReportRow => {
      if (rowGroup.length === 0) return rowGroup[0];
      return {
        ...rowGroup[0],
        totalVotes: String(
          iter(rowGroup)
            .map((row) => safeParseInt(row.totalVotes).unsafeUnwrap())
            .sum()
        ),
      };
    })
    // Convert to SemsResultsRow
    .map((row): SemsResultsRow => {
      const contest = find(election.contests, (c) => c.id === row.contestId);
      const party =
        contest.type === 'candidate' && contest.partyId
          ? find(election.parties, (p) => p.id === contest.partyId)
          : undefined;

      const selectionRows = (() => {
        switch (contest.type) {
          case 'candidate': {
            // TODO aggregate write-in rows if selectionId.startsWith('write-in')
            if (row.selectionId.startsWith('write-in')) {
              return {
                candidateId: '0',
                candidateName: 'Write-in',
                candidatePartyId: NONPARTISAN_PARTY_ID,
                candidatePartyLabel: NONPARTISAN_PARTY_LABEL,
              };
            }
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
        ...selectionRows,
        voteCount: row.totalVotes,
      };
    });

  return stringify(resultsRows, {
    quoted: true,
    recordDelimiter: ',\r\n',
  }).trimEnd();
}
