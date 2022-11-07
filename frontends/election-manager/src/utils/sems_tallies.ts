import _ from 'lodash';

import {
  CandidateContest,
  Contest,
  Dictionary,
  Election,
  YesNoContest,
  expandEitherNeitherContests,
  ContestOptionTally,
  ContestTally,
  ExternalTally,
  ExternalTallySourceType,
  FullElectionExternalTally,
  VotingMethod,
  writeInCandidate,
  YesNoVoteOption,
  CountyId,
  PrecinctId,
  ContestId,
  PartyId,
  CandidateId,
  unsafeParse,
  PartyIdSchema,
} from '@votingworks/types';

import { assert, throwIllegalValue } from '@votingworks/utils';

import {
  convertTalliesByPrecinctToFullExternalTally,
  getTotalNumberOfBallots,
} from './external_tallies';

const WriteInCandidateId = '0';
const OvervoteCandidateId = '1';
const UndervoteCandidateId = '2';

export interface SemsFileRow {
  countyId: CountyId;
  precinctId: PrecinctId;
  contestId: ContestId;
  contestTitle: string;
  partyId: PartyId;
  partyName: string;
  candidateId: CandidateId;
  candidateName: string;
  candidatePartyId: PartyId;
  candidatePartyName: string;
  numberOfVotes: number;
}

// TODO(caro) revisit how to count the total number of ballots for multi seat contests
// The number of total ballots is undervotes + overvotes + (othervotes / numseats)
// That formula assumes all votes voted for the maximum number of seats allowed which is
// probably not true in practice. This is irrelevant with the number of seats is 1.
export function getContestTallyForCandidateContest(
  contest: CandidateContest,
  rows: SemsFileRow[]
): ContestTally {
  const tallies: Dictionary<ContestOptionTally> = {};
  let undervotes = 0;
  let overvotes = 0;
  let numCandidateVotes = 0;
  let writeInVotes = 0;
  const validCandidates = _.keyBy(contest.candidates, 'id');
  for (const row of rows) {
    if (row.candidateId === UndervoteCandidateId) {
      undervotes = row.numberOfVotes;
    } else if (row.candidateId === OvervoteCandidateId) {
      overvotes = row.numberOfVotes;
    } else if (
      contest.allowWriteIns &&
      row.candidateId === WriteInCandidateId
    ) {
      writeInVotes += row.numberOfVotes;
      numCandidateVotes += row.numberOfVotes;
    } else if (row.candidateId === WriteInCandidateId) {
      // Ignore Row
    } else if (row.candidateId in validCandidates) {
      const candidate = validCandidates[row.candidateId];
      let previousVoteCounts = 0;
      if (candidate.id in tallies) {
        previousVoteCounts = (tallies[candidate.id] as ContestOptionTally)
          .tally;
      }
      tallies[candidate.id] = {
        option: candidate,
        tally: row.numberOfVotes + previousVoteCounts,
      };
      numCandidateVotes += row.numberOfVotes;
    } else {
      throw new Error(
        `Loaded file has unexpected candidate id ${row.candidateId} for contest ${contest.id}`
      );
    }
  }

  if (contest.allowWriteIns) {
    tallies[writeInCandidate.id] = {
      option: writeInCandidate,
      tally: writeInVotes,
    };
  }

  return {
    contest,
    tallies,
    metadata: {
      overvotes,
      undervotes,
      ballots: Math.ceil(
        (numCandidateVotes + overvotes + undervotes) / contest.seats
      ),
    },
  };
}

export function getContestTallyForYesNoContest(
  contest: YesNoContest,
  rows: SemsFileRow[]
): ContestTally {
  const tallies: Dictionary<ContestOptionTally> = {};
  let undervotes = 0;
  let overvotes = 0;
  let numVotes = 0;
  for (const row of rows) {
    if (row.candidateId === UndervoteCandidateId) {
      undervotes = row.numberOfVotes;
      numVotes += row.numberOfVotes;
    } else if (row.candidateId === OvervoteCandidateId) {
      overvotes = row.numberOfVotes;
      numVotes += row.numberOfVotes;
    } else if (contest.yesOption && row.candidateId === contest.yesOption.id) {
      const previousVoteCounts =
        'yes' in tallies ? (tallies['yes'] as ContestOptionTally).tally : 0;
      tallies['yes'] = {
        option: ['yes'] as YesNoVoteOption,
        tally: row.numberOfVotes + previousVoteCounts,
      };
      numVotes += row.numberOfVotes;
    } else if (contest.noOption && row.candidateId === contest.noOption.id) {
      const previousVoteCounts =
        'no' in tallies ? (tallies['no'] as ContestOptionTally).tally : 0;
      tallies['no'] = {
        option: ['no'] as YesNoVoteOption,
        tally: row.numberOfVotes + previousVoteCounts,
      };
      numVotes += row.numberOfVotes;
    } else if (row.candidateId === WriteInCandidateId) {
      // Ignore row
    } else {
      throw new Error(
        `Loaded file has unexpected option id ${row.candidateId} for contest ${contest.id}`
      );
    }
  }

  return {
    contest,
    tallies,
    metadata: {
      overvotes,
      undervotes,
      ballots: numVotes,
    },
  };
}

function sanitizeItem(item: string): string {
  return item.replace(/['"`]/g, '').trim();
}

function parseFileContentRows(fileContent: string): SemsFileRow[] {
  const parsedRows: SemsFileRow[] = [];
  for (const row of fileContent.split('\n')) {
    const entries = row
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map((e) => sanitizeItem(e));
    if (entries.length >= 11) {
      parsedRows.push({
        countyId: entries[0],
        precinctId: entries[1],
        contestId: entries[2],
        contestTitle: entries[3],
        partyId: unsafeParse(PartyIdSchema, entries[4]),
        partyName: entries[5],
        candidateId: entries[6],
        candidateName: entries[7],
        candidatePartyId: unsafeParse(PartyIdSchema, entries[8]),
        candidatePartyName: entries[9],
        // eslint-disable-next-line vx/gts-safe-number-parse
        numberOfVotes: parseInt(entries[10], 10),
      });
    }
  }
  return parsedRows;
}

export function parseSemsFileAndValidateForElection(
  fileContent: string,
  election: Election
): string[] {
  const errors: string[] = [];

  const parsedRows = parseFileContentRows(fileContent);

  if (parsedRows.length === 0) {
    return [
      'No valid CSV data found in loaded file. Please check file contents.',
    ];
  }

  for (const row of parsedRows) {
    if (election.precincts.every(({ id }) => id !== row.precinctId)) {
      errors.push(
        `Precinct ID ${row.precinctId} is not found in the election definition.`
      );
    }

    const contest = expandEitherNeitherContests(election.contests).find(
      (c) => c.id === row.contestId
    );
    if (contest === undefined) {
      errors.push(
        `Contest ID ${row.contestId} is not found in the election definition.`
      );
    } else {
      switch (contest.type) {
        case 'candidate': {
          const validCandidates = [
            UndervoteCandidateId,
            OvervoteCandidateId,
            ...contest.candidates.map((c) => c.id),
          ];
          if (contest.allowWriteIns) {
            validCandidates.push(WriteInCandidateId);
          }
          // Allow an illegal write in candidate row if the number of votes is 0
          const isWriteInSkippable =
            !contest.allowWriteIns &&
            row.candidateId === WriteInCandidateId &&
            row.numberOfVotes === 0;
          if (
            !validCandidates.includes(row.candidateId) &&
            !isWriteInSkippable
          ) {
            errors.push(
              `Candidate ID ${row.candidateId} is not a valid candidate ID for the contest: ${row.contestId}.`
            );
          }
          break;
        }
        case 'yesno': {
          const validCandidates = [
            UndervoteCandidateId,
            OvervoteCandidateId,
            contest.yesOption?.id,
            contest.noOption?.id,
          ];
          if (
            contest.yesOption === undefined ||
            contest.noOption === undefined
          ) {
            errors.push(
              `Election definition not configured to handle SEMs data formats, IDs must be specified on the yes no contest: ${row.contestId}.`
            );
          }
          const isWriteInSkippable =
            row.candidateId === WriteInCandidateId && row.numberOfVotes === 0;
          if (
            !validCandidates.includes(row.candidateId) &&
            !isWriteInSkippable
          ) {
            errors.push(
              `Contest Choice ID ${row.candidateId} is not a valid contest choice ID for the contest: ${row.contestId}.`
            );
          }
          break;
        }
        default:
          throwIllegalValue(contest, 'type');
      }
    }
  }

  return errors;
}

export function convertSemsFileToExternalTally(
  fileContent: string,
  election: Election,
  votingMethodForFile: VotingMethod,
  fileName: string,
  fileModified: Date
): FullElectionExternalTally {
  const parsedRows = parseFileContentRows(fileContent);

  const contestsById: Dictionary<Contest> = {};
  for (const contest of expandEitherNeitherContests(election.contests)) {
    contestsById[contest.id] = contest;
  }

  const contestTalliesByPrecinct: Dictionary<ExternalTally> = {};
  const parsedRowsByPrecinct = _.groupBy(parsedRows, 'precinctId');

  for (const precinctId of Object.keys(parsedRowsByPrecinct)) {
    if (!election.precincts.find((p) => p.id === precinctId)) {
      throw new Error(`Loaded file has unexpected PrecinctId: ${precinctId}`);
    }
    const rowsForPrecinct = parsedRowsByPrecinct[precinctId];

    const contestTallies: Dictionary<ContestTally> = {};
    const rowsForPrecinctAndContest = _.groupBy(rowsForPrecinct, 'contestId');
    for (const contestId of Object.keys(rowsForPrecinctAndContest)) {
      if (!(contestId in contestsById)) {
        throw new Error(`Loaded file has unexpected PrecinctId: ${contestId}`);
      }
      const electionContest = contestsById[contestId];
      assert(electionContest);

      if (electionContest.type === 'candidate') {
        const contestTally = getContestTallyForCandidateContest(
          electionContest as CandidateContest,
          rowsForPrecinctAndContest[contestId]
        );
        contestTallies[contestId] = contestTally;
      } else if (electionContest.type === 'yesno') {
        const contestTally = getContestTallyForYesNoContest(
          electionContest as YesNoContest,
          rowsForPrecinctAndContest[contestId]
        );
        contestTallies[contestId] = contestTally;
      }
    }
    const numBallotsInPrecinct = getTotalNumberOfBallots(
      contestTallies,
      election
    );
    contestTalliesByPrecinct[precinctId] = {
      contestTallies,
      numberOfBallotsCounted: numBallotsInPrecinct,
    };
  }

  return convertTalliesByPrecinctToFullExternalTally(
    contestTalliesByPrecinct,
    election,
    votingMethodForFile,
    ExternalTallySourceType.SEMS,
    fileName,
    fileModified
  );
}
