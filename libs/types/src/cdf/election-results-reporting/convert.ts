import { assertDefined, err, ok, Result } from '@votingworks/basics';
import getDeepValue from 'lodash.get';
import { Candidate, CandidateId } from '../../election';
import { LanguageCode } from '../../language_code';
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

type CandidateNameRecord = Record<CandidateId, Candidate['name']>;

// This is used somewhat widely because many fields in the ERR schema are not technically
// required and therefore are optional in the type. In many of these cases, the file would
// be useless without such fields. For example, a CandidateSelection has multiplicity 0..*
// for the Candidate prop. Votes described by a CandidateSelection can't be mapped to a
// candidate without that prop, so we assertGetDeepValue rather than eg.
// use and handle a Result.
function assertGetDeepValue(root: unknown, valuePath: string) {
  return assertDefined(
    getDeepValue(root, valuePath),
    `Couldn't get value: ${valuePath}`
  );
}

export interface LanguageStringQueryParams {
  language?: LanguageCode;
  content?: RegExp;
}

/**
 * Finds a LanguageString matching the given query parameters from a list of LanguageStrings.
 * @param textEntries List of ERR-formatted LanguageStrings
 * @param queryParams An object allowing the caller to query by LanguageCode, RegExp, or both. `language` and `content` default to LanguageCode.English and \/.*\/ respectively.
 * @returns The first LanguageString to match the query params.
 */
export function findLanguageString(
  textEntries: readonly ResultsReporting.LanguageString[],
  { language = LanguageCode.ENGLISH, content = /.*/ }: LanguageStringQueryParams
): ResultsReporting.LanguageString | undefined {
  function textContentFilter(entry: ResultsReporting.LanguageString): boolean {
    return !!entry.Content.match(content);
  }
  function languageFilter(entry: ResultsReporting.LanguageString): boolean {
    return entry.Language === language;
  }

  return textEntries.find(
    (entry: ResultsReporting.LanguageString) =>
      textContentFilter(entry) && languageFilter(entry)
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
): ResultsReporting.BallotMeasureSelection {
  return assertDefined(
    ballotMeasureSelections.find((selection) => {
      const internationalizedText = selection.Selection;
      return !!findLanguageString(internationalizedText.Text, {
        content,
      });
    }),
    `Could not find ballot measure selection with content "${content.toString()}"`
  );
}

function findTotalVoteCounts(
  voteCounts: readonly ResultsReporting.VoteCounts[]
): number {
  return assertDefined(
    voteCounts.find((vc) => vc.Type === CountItemType.Total),
    'Could not find total vote count'
  ).Count;
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
  const yesOption = findBallotMeasureSelectionWithContent(
    /yes/i,
    contestSelections
  );
  const noOption = findBallotMeasureSelectionWithContent(
    /no/i,
    contestSelections
  );
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
    contestId: contest['@id'],
    contestType: 'yesno',
    yesOptionId: yesOption['@id'],
    noOptionId: noOption['@id'],
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
function getBallotCounts(contest: ResultsReporting.CandidateContest): {
  overvotes: number;
  undervotes: number;
  total: number;
} {
  const otherCounts = contest.OtherCounts && contest.OtherCounts[0];

  let ballotCount =
    0 + (otherCounts?.Overvotes || 0) + (otherCounts?.Undervotes || 0);

  for (const contestSelection of assertDefined(contest.ContestSelection)) {
    const voteCounts = assertDefined(contestSelection.VoteCounts);
    const totalCount = findTotalVoteCounts(voteCounts);
    ballotCount += totalCount;
  }

  return {
    overvotes: otherCounts?.Overvotes || 0,
    undervotes: otherCounts?.Undervotes || 0,
    total: ballotCount,
  };
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
  for (const selection of contest.ContestSelection as ResultsReporting.CandidateSelection[]) {
    const candidateId = selection['@id'];
    tallies[candidateId] = {
      id: candidateId,
      name: candidateNameRecord[candidateId],
      tally: findTotalVoteCounts(assertDefined(selection.VoteCounts)),
    };
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
): VxTabulation.CandidateContestResults {
  const { overvotes, undervotes, total } = getBallotCounts(contest);

  return {
    contestId: contest['@id'],
    contestType: 'candidate',
    votesAllowed: contest.VotesAllowed,
    overvotes,
    undervotes,
    ballots: total,
    tallies: getCandidateTallies(contest, candidateNameRecord),
  };
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
      vxFormattedContests[contest['@id']] = convertCandidateContest(
        contest,
        candidateNameRecord
      );
    } else if (isBallotMeasureContest(contest) || isRetentionContest(contest)) {
      vxFormattedContests[contest['@id']] = convertToYesNoContest(contest);
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
  electionReport: ResultsReporting.ElectionReport
): CandidateNameRecord {
  const records: CandidateNameRecord = {};
  const candidates = getDeepValue(electionReport, 'Election[0].Candidate');

  // Though unlikely in practice, an election may exist with no candidates
  if (!candidates) {
    return records;
  }
  for (const candidate of candidates) {
    const textEntries = assertGetDeepValue(
      candidate,
      'BallotName.Text'
    ) as ResultsReporting.LanguageString[];
    records[candidate['@id']] = assertDefined(
      findLanguageString(textEntries, { language: LanguageCode.ENGLISH })
    ).Content;
  }

  return records;
}
/**
 * Converts an ElectionReport to an instance of ManualElectionResults.
 * @param electionReport
 * @returns an instance of ManualElectionResults.
 */
export function convertElectionResultsReportingReportToVxManualResults(
  electionReport: ResultsReporting.ElectionReport
): Result<VxTabulation.ManualElectionResults, Error> {
  const candidateNameRecord = buildCandidateNameRecords(electionReport);

  const wrappedContestResults = convertContestsListToVxResultsRecord(
    assertGetDeepValue(electionReport, 'Election[0].Contest'),
    candidateNameRecord
  );
  if (wrappedContestResults.isErr()) {
    return err(wrappedContestResults.err());
  }

  const manualResults: VxTabulation.ManualElectionResults = {
    contestResults: wrappedContestResults.ok(),
    ballotCount: assertGetDeepValue(
      electionReport,
      'Election[0].BallotCounts[0].BallotsCast'
    ),
  };

  return ok(manualResults);
}