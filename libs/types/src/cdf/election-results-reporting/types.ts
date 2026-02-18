import {
  BallotMeasureContest,
  CandidateContest,
  PartyContest,
  RetentionContest,
} from '.';

export function isBallotMeasureContest(
  contest:
    | PartyContest
    | BallotMeasureContest
    | CandidateContest
    | RetentionContest
): contest is BallotMeasureContest {
  return contest['@type'] === 'ElectionResults.BallotMeasureContest';
}

export function isRetentionContest(
  contest:
    | PartyContest
    | BallotMeasureContest
    | CandidateContest
    | RetentionContest
): contest is RetentionContest {
  return contest['@type'] === 'ElectionResults.RetentionContest';
}

export function isCandidateContest(
  contest:
    | PartyContest
    | BallotMeasureContest
    | CandidateContest
    | RetentionContest
): contest is CandidateContest {
  return contest['@type'] === 'ElectionResults.CandidateContest';
}

export function isPartyContest(
  contest:
    | PartyContest
    | BallotMeasureContest
    | CandidateContest
    | RetentionContest
): contest is PartyContest {
  return contest['@type'] === 'ElectionResults.PartyContest';
}
