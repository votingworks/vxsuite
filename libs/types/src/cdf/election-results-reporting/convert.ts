import { assertDefined, find, err, ok, Result } from '@votingworks/basics';
import { Candidate, CandidateId } from '../../election';
import * as ResultsReporting from '.';
import * as VxTabulation from '../../tabulation';
import {
  BallotMeasureContest,
  CandidateContest,
  CountItemType,
  PartyContest,
  RetentionContest,
} from '.';
import {
  isBallotMeasureContest,
  isCandidateContest,
  isRetentionContest,
} from './types';
import { TEMPORARY_WRITE_IN_ID_PREFIX } from '../../admin';
import { CDF_ERR_VX_ID_PREFIX } from './constants';

type CandidateNameRecord = Record<CandidateId, Candidate['name']>;

// ERR export from VxAdmin prepends `vx_` to IDs to ensure compliance with NCName
// which cannot start with a number. For developer convenience, strip `vx_` from
// the start of any IDs when importing. Without this, import will fail because
// ERR IDs will not have matches in the election definition.
function trimVxIdPrefix(id: string): string {
  if (id.startsWith(CDF_ERR_VX_ID_PREFIX)) {
    return id.substring(CDF_ERR_VX_ID_PREFIX.length);
  }

  return id;
}

export interface LanguageStringQueryParams {
  language?: string;
  content?: RegExp;
}

/**
 * Finds a LanguageString matching the given query parameters from a list of LanguageStrings.
 * @param textEntries List of ERR-formatted LanguageStrings
 * @param queryParams An object allowing the caller to query by LanguageCode, RegExp, or both. `language` and `content` default to 'en' and \/.*\/ respectively.
 * @returns The first LanguageString to match the query params.
 */
export function findLanguageString(
  textEntries: readonly ResultsReporting.LanguageString[],
  { language = 'en', content = /.*/ }: LanguageStringQueryParams
): ResultsReporting.LanguageString | null {
  function textContentFilter(entry: ResultsReporting.LanguageString): boolean {
    return !!entry.Content.match(content);
  }
  function languageFilter(entry: ResultsReporting.LanguageString): boolean {
    return entry.Language === language;
  }

  return find(
    textEntries,
    (entry) => !!(entry && textContentFilter(entry) && languageFilter(entry)),
    null
  );
}

/**
 * Given a list of BallotMeasureSelections, finds and returns the first one whose text matches
 * the given RegExp.
 * @param content RegExp to match.
 * @param ballotMeasureSelections List of ERR-formatted ballot measure selections.
 * @returns The first BallotMeasureSelection whose text matches `content`.
 */
export function findBallotMeasureSelectionWithContent(
  content: RegExp,
  ballotMeasureSelections: readonly ResultsReporting.BallotMeasureSelection[]
): ResultsReporting.BallotMeasureSelection | undefined {
  return ballotMeasureSelections.find((selection) => {
    const internationalizedText = selection.Selection;
    return !!findLanguageString(internationalizedText.Text, {
      content,
    });
  });
}

function findTotalVoteCounts(
  voteCounts: readonly ResultsReporting.VoteCounts[]
): number {
  return find(voteCounts, (vc) => vc.Type === CountItemType.Total).Count;
}

/**
 * Converts an ERR-formatted BallotMeasureContest or RetentionContest to Vx-formatted YesNoContestResults.
 * BallotMeasureContest and RetentionContest treated identically, though the latter has extra fields we ignore.
 * @param contest ERR-formatted contest
 * @returns Vx-formatted YesNoContestResults.
 */
function convertToYesNoContest(
  contest:
    | ResultsReporting.BallotMeasureContest
    // RetentionContest inherits from BallotMeasureContest.
    // It also has additional fields for candidate that we ignore.
    | ResultsReporting.RetentionContest
): VxTabulation.YesNoContestResults {
  const contestSelections = assertDefined(
    contest.ContestSelection
  ) as ResultsReporting.BallotMeasureSelection[];
  let yesOption = findBallotMeasureSelectionWithContent(
    /yes/i,
    contestSelections
  );
  let noOption = findBallotMeasureSelectionWithContent(
    /no/i,
    contestSelections
  );

  if (!(yesOption && noOption)) {
    [yesOption, noOption] = contestSelections;
  }

  const otherCounts = contest.OtherCounts && contest.OtherCounts[0];
  const yesTally = findTotalVoteCounts(
    assertDefined(
      yesOption.VoteCounts,
      'Could not find VoteCounts for "Yes" option'
    )
  );
  const noTally = findTotalVoteCounts(
    assertDefined(
      noOption.VoteCounts,
      'Could not find VoteCounts for "No" option'
    )
  );
  const overvotes = otherCounts?.Overvotes || 0;
  const undervotes = otherCounts?.Undervotes || 0;

  return {
    contestId: trimVxIdPrefix(contest['@id']),
    contestType: 'yesno',
    yesOptionId: trimVxIdPrefix(yesOption['@id']),
    noOptionId: trimVxIdPrefix(noOption['@id']),
    yesTally,
    noTally,
    overvotes,
    undervotes,
    ballots: yesTally + noTally + overvotes + undervotes,
  };
}

/**
 * Parses an ERR-formatted candidate contest to return counts expected by Vx-formatted results.
 * @param contest An ERR-formatted contest.
 * @returns Overvotes, undervotes, and total votes for all ballots.
 */
function getBallotCounts(contest: ResultsReporting.CandidateContest): Result<
  {
    overvotes: number;
    undervotes: number;
    total: number;
  },
  Error
> {
  const otherCounts = contest.OtherCounts && contest.OtherCounts[0];

  let totalCandidateVotes = 0;

  for (const contestSelection of assertDefined(contest.ContestSelection)) {
    const voteCounts = assertDefined(contestSelection.VoteCounts);
    const totalCount = findTotalVoteCounts(voteCounts);
    totalCandidateVotes += totalCount;
  }

  const totalBallots =
    (totalCandidateVotes +
      (otherCounts?.Overvotes || 0) +
      (otherCounts?.Undervotes || 0)) /
    contest.VotesAllowed;

  if (!Number.isInteger(totalBallots)) {
    return err(
      new Error(
        `Expected an integer value for total ballots but got ${totalBallots}`
      )
    );
  }

  return ok({
    overvotes: otherCounts?.Overvotes || 0,
    undervotes: otherCounts?.Undervotes || 0,
    total: totalBallots,
  });
}

/**
 * Parses an ERR-formatted candidate contest to get Vx-formatted tallies. Tallies are a required property
 * of the larger CandidateContestResults struct.
 * @param contest ERR-formatted CandidateContest
 * @param candidateNameRecord Map of candidate IDs to names
 * @returns A Record that maps candidate ID to their tallies for a single contest.
 */
function getCandidateTallies(
  contest: ResultsReporting.CandidateContest,
  candidateNameRecord: CandidateNameRecord
): Record<CandidateId, VxTabulation.CandidateTally> {
  const tallies: Record<CandidateId, VxTabulation.CandidateTally> = {};

  // Record that maps lowercase candidate name to an array of tallies: one tally per name spelling.
  // In the event of case-insensitive matches, we later collapse matching names into a single
  // write-in candidate.
  // Example:
  // "George Washington" gets 5 write-in votes and "George washington" gets 1 write-in vote.
  // The resulting Record is:
  // {
  //   "george washington": [
  //     {id: "...", name: "George Washington", tally: 5, isWriteIn: true},
  //     {id: "...", name: "George washington": tally: 1, isWriteIn: true}
  //   ]
  // }
  const writeInCandidateNameRecord: Record<
    string,
    VxTabulation.CandidateTally[]
  > = {};

  for (const selection of contest.ContestSelection as ResultsReporting.CandidateSelection[]) {
    const baseCandidateId = trimVxIdPrefix(
      assertDefined(
        selection.CandidateIds,
        'Expected CandidateSelection.Candidate to be defined'
      )[0]
    );
    if (selection.IsWriteIn) {
      // ID prefix indicates to VxAdmin logic that this was a write in
      const candidateId = `${TEMPORARY_WRITE_IN_ID_PREFIX}${baseCandidateId}`;

      const name = candidateNameRecord[baseCandidateId];
      const tally: VxTabulation.CandidateTally = {
        id: candidateId,
        name,
        tally: findTotalVoteCounts(assertDefined(selection.VoteCounts)),
        isWriteIn: true,
      };

      tallies[candidateId] = tally;
      const lowerCaseName = name.toLowerCase();
      if (!writeInCandidateNameRecord[lowerCaseName]) {
        writeInCandidateNameRecord[lowerCaseName] = [];
      }
      writeInCandidateNameRecord[lowerCaseName].push(tally);
    } else {
      const name = candidateNameRecord[baseCandidateId];
      const tally: VxTabulation.CandidateTally = {
        id: baseCandidateId,
        name,
        tally: findTotalVoteCounts(assertDefined(selection.VoteCounts)),
      };

      tallies[baseCandidateId] = tally;
    }
  }

  // Dedupe write-in candidates (amongst other write-ins only).
  // Write-ins that duplicate official candidates are not deduped ie. the
  // candidates "regular" votes will show up separately from their write-in votes.
  for (const lowerCaseName of Object.keys(writeInCandidateNameRecord)) {
    // Get list of tallies grouped by case-insensitive name
    const talliesForName = writeInCandidateNameRecord[lowerCaseName];
    // Sort by vote count descending
    const sorted = talliesForName.slice().sort((a, b) => b.tally - a.tally);
    // Sum vote count for candidate across all spellings
    const voteSum = sorted
      .map((tally) => tally.tally)
      .reduce((prevSum, incremental) => prevSum + incremental, 0);

    // Choose the most popular spelling and update their vote count to the summed vote count
    const mostPopularSpelling = sorted[0];
    tallies[mostPopularSpelling.id] = {
      ...tallies[mostPopularSpelling.id],
      tally: voteSum,
    };

    // Delete tallies for all other spellings
    for (let i = 1; i < sorted.length; i += 1) {
      delete tallies[sorted[i].id];
    }
  }

  return tallies;
}

/**
 * Converts a single ERR-formatted candidate contest to a Vx-formatted candidate contest result.
 * @param contest ERR-formatted CandidateContest
 * @param candidateNameRecord Map of candidate IDs to names
 * @returns Vx-formatted candidate contest result.
 */
function convertCandidateContest(
  contest: ResultsReporting.CandidateContest,
  candidateNameRecord: CandidateNameRecord
): Result<VxTabulation.CandidateContestResults, Error> {
  const result = getBallotCounts(contest);
  if (result.isErr()) {
    return err(result.err());
  }

  const { overvotes, undervotes, total } = result.ok();

  return ok({
    contestId: trimVxIdPrefix(contest['@id']),
    contestType: 'candidate',
    votesAllowed: contest.VotesAllowed,
    overvotes,
    undervotes,
    ballots: total,
    tallies: getCandidateTallies(contest, candidateNameRecord),
  });
}

/**
 * Converts a list of ERR-formatted contests to Vx-formatted contest results.
 * @param contestList Array of contests in ERR format
 * @param candidateNameRecord Map of candidate IDs to names
 * @returns Vx-formatted contest results
 */
function convertContestsListToVxResultsRecord(
  contestList: ReadonlyArray<
    PartyContest | BallotMeasureContest | CandidateContest | RetentionContest
  >,
  candidateNameRecord: CandidateNameRecord
): Result<VxTabulation.ElectionResults['contestResults'], Error> {
  const vxFormattedContests: VxTabulation.ElectionResults['contestResults'] =
    {};
  for (const contest of contestList) {
    if (isCandidateContest(contest)) {
      const vxFormattedResult = convertCandidateContest(
        contest,
        candidateNameRecord
      );
      if (vxFormattedResult.isErr()) {
        return err(vxFormattedResult.err());
      }

      vxFormattedContests[trimVxIdPrefix(contest['@id'])] =
        vxFormattedResult.ok();
    } else if (isBallotMeasureContest(contest) || isRetentionContest(contest)) {
      vxFormattedContests[trimVxIdPrefix(contest['@id'])] =
        convertToYesNoContest(contest);
    } else {
      return err(
        new Error(
          `Unsupported Election Results Reporting contest type ${contest['@type']}`
        )
      );
    }
  }

  return ok(vxFormattedContests);
}

/**
 * Builds a Record of CandidateId:Name for local use. Needed because
 * ERR does not list candidate name alongside candidate ID in tallies,
 * but VX tally data structures do. This map is referenced when populating VX
 * tallies.
 */
function buildCandidateNameRecords(
  election: ResultsReporting.Election
): CandidateNameRecord {
  const records: CandidateNameRecord = {};

  // Though unlikely in practice, an election may exist with no candidates
  if (!election.Candidate) {
    return records;
  }

  for (const candidate of election.Candidate) {
    const textEntries = assertDefined(candidate.BallotName).Text;
    records[trimVxIdPrefix(candidate['@id'])] = assertDefined(
      findLanguageString(textEntries, { language: 'en' })
    ).Content;
  }

  return records;
}

/**
 * Validates that the candidates in the ElectionReport are known to the caller. The intended use
 * is to validate that candidates in the ElectionReport have matching IDs in the VX election definition,
 * though the implementation doesn't enforce the ElectionDefinition type.
 */
function validateCandidateIds(
  contests: ReadonlyArray<
    PartyContest | BallotMeasureContest | CandidateContest | RetentionContest
  >,
  validCandidateIds: Set<string>
): Result<void, Error> {
  // This iteration pattern is similar or identical to that used by the conversion logic,
  // but it's much more readable to separate the validation and worth the redundant iteration.
  for (const contest of contests) {
    if (isCandidateContest(contest)) {
      const contestSelections = assertDefined(
        contest.ContestSelection,
        'No ContestSelections defined for CandidateContest'
      ) as ResultsReporting.CandidateSelection[];
      for (const selection of contestSelections) {
        if (selection.IsWriteIn) {
          continue;
        }

        const candidateId = trimVxIdPrefix(
          assertDefined(
            selection.CandidateIds,
            `No candidate ID on selection: ${JSON.stringify(
              selection,
              null,
              2
            )}`
          )[0]
        );

        if (!validCandidateIds.has(candidateId)) {
          return err(
            new Error(
              `Candidate ID in ERR file has no matching ID in VX election definition: ${candidateId}`
            )
          );
        }
      }
    }
  }

  return ok();
}
/**
 * Converts an ElectionReport to an instance of ManualElectionResults.
 * @param electionReport Data from a CDF Election Results Reporting file.
 * @param validCandidateIds A list of candidate IDs extracted from an ElectionDefinition. ERR candidate IDs unknown to the caller (eg. those specified in an ElectionDefinition) are unsupported. The implementation will return an error if the ERR contents contain a candidate ID not specified in validCandidateIds.
 * @returns an instance of ManualElectionResults.
 */
export function convertElectionResultsReportingReportToVxManualResults(
  electionReport: ResultsReporting.ElectionReport,
  validCandidateIds: Set<string>
): Result<VxTabulation.ManualElectionResults, Error> {
  // Use assertDefiend because many fields in the ERR schema are not technically
  // required and therefore are optional in the type. In many of these cases, the file would
  // be useless without such fields. For example, ElectionReport.Election has multiplicity
  // 0..*. But if an ElectionReport had no Election, it wouldn't describe anything parseable
  // to ManualElectionResults.
  const electionList = assertDefined(
    electionReport.Election,
    'No election list defined in ElectionReport'
  );
  const election = assertDefined(
    electionList[0],
    'No election defined in ElectionReport.Election'
  );

  const contests = assertDefined(
    election.Contest,
    'No contests in ElectionReport.Election'
  );

  const candidateValidationResult = validateCandidateIds(
    contests,
    validCandidateIds
  );
  if (candidateValidationResult.isErr()) {
    return err(candidateValidationResult.err());
  }

  const candidateNameRecord = buildCandidateNameRecords(election);
  const wrappedContestResults = convertContestsListToVxResultsRecord(
    assertDefined(election.Contest, 'No contests defined for election'),
    candidateNameRecord
  );
  if (wrappedContestResults.isErr()) {
    return err(wrappedContestResults.err());
  }

  const ballotCountList = assertDefined(
    election.BallotCounts,
    'No ballot counts defined for election'
  );
  const ballotCount = assertDefined(
    ballotCountList[0].BallotsCast,
    'No total count of ballots cast defined for BallotCounts entry'
  );
  const manualResults: VxTabulation.ManualElectionResults = {
    contestResults: wrappedContestResults.ok(),
    ballotCount,
  };

  return ok(manualResults);
}
