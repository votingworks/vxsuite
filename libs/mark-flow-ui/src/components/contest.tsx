import React from 'react';
import {
  CandidateVote,
  Election,
  OptionalYesNoVote,
  VotesDict,
} from '@votingworks/types';
import { CandidateContest } from './candidate_contest';
import { MsEitherNeitherContest } from './ms_either_neither_contest';
import { YesNoContest } from './yes_no_contest';
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { UpdateVoteFunction } from '../config/types';
import { BreadcrumbMetadata } from './contest_header';

export interface ContestProps {
  /**
   * Optional data for displaying the contest's position on the ballot.
   */
  breadcrumbs?: BreadcrumbMetadata;

  /**
   * The election the contest belongs to.
   */
  election: Election;

  /**
   * The contest to display.
   */
  contest: ContestsWithMsEitherNeither[number];

  /**
   * All votes by the voter.
   */
  votes: VotesDict;

  /**
   * Updates the votes for the contest.
   */
  updateVote: UpdateVoteFunction;
}

export function Contest({
  breadcrumbs,
  election,
  contest,
  votes,
  updateVote,
}: ContestProps): JSX.Element {
  const vote = votes[contest.id];

  return (
    <React.Fragment>
      {contest.type === 'candidate' && (
        <CandidateContest
          aria-live="assertive"
          breadcrumbs={breadcrumbs}
          election={election}
          contest={contest}
          vote={(vote ?? []) as CandidateVote}
          updateVote={updateVote}
        />
      )}
      {contest.type === 'yesno' && (
        <YesNoContest
          breadcrumbs={breadcrumbs}
          election={election}
          contest={contest}
          vote={vote as OptionalYesNoVote}
          updateVote={updateVote}
        />
      )}
      {contest.type === 'ms-either-neither' && (
        <MsEitherNeitherContest
          breadcrumbs={breadcrumbs}
          election={election}
          contest={contest}
          eitherNeitherContestVote={
            votes[contest.eitherNeitherContestId] as OptionalYesNoVote
          }
          pickOneContestVote={
            votes[contest.pickOneContestId] as OptionalYesNoVote
          }
          updateVote={updateVote}
        />
      )}
    </React.Fragment>
  );
}
