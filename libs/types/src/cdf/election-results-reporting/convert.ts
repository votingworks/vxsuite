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
      return err(new Error(`Unsupported ERR contest type ${contest['@type']}`));
    }
  }

  return ok(vxFormattedContests);
}

// Builds a Record of CandidateId:Name for local use. Needed because
// ERR does not list candidate name alongside candidate ID in tallies,
// but VX tally data structures do. This map is referenced when populating VX
// tallies.
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
export function getManualResultsFromErrElectionResults(
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
