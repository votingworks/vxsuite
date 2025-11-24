import React, { useMemo } from 'react';
import {
  CandidateVote,
  Election,
  OptionalYesNoVote,
  VotesDict,
} from '@votingworks/types';
import { AccessibilityMode } from '@votingworks/ui';
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
   * The ballot style for the voter.
   */
  ballotStyleId: string;

  /**
   * The election the contest belongs to.
   */
  election: Election;

  /**
   * The contest to display.
   */
  contest: ContestsWithMsEitherNeither[number];

  onOpenWriteInKeyboard?: () => void;
  onCloseWriteInKeyboard?: () => void;

  /**
   * All votes by the voter.
   */
  votes: VotesDict;

  /**
   * Updates the votes for the contest.
   */
  updateVote: UpdateVoteFunction;

  /**
   * Whether the on-screen write-in keyboard should use scan panels
   * for assistive technology input switches or support 2-dimensional navigation
   * for ATI controllers with directional buttons.
   */
  accessibilityMode?: AccessibilityMode;

  numWriteInCharactersAllowedAcrossContests?: number;
}

function countNumWriteInCharactersUsedAcrossContests(votes: VotesDict): number {
  return Object.values(votes)
    .flat()
    .filter((vote) => vote !== undefined && typeof vote !== 'string')
    .map((vote) => (vote.isWriteIn ? vote.name.length : 0))
    .reduce((acc, n) => acc + n, 0);
}

export function Contest({
  breadcrumbs,
  ballotStyleId,
  election,
  contest,
  votes,
  updateVote,
  accessibilityMode,
  onOpenWriteInKeyboard,
  onCloseWriteInKeyboard,
  numWriteInCharactersAllowedAcrossContests = Infinity,
}: ContestProps): JSX.Element {
  const vote = votes[contest.id];
  const numWriteInCharactersUsedAcrossContests = useMemo(
    () => countNumWriteInCharactersUsedAcrossContests(votes),
    [votes]
  );

  return (
    <React.Fragment>
      {contest.type === 'candidate' && (
        <CandidateContest
          aria-live="assertive"
          breadcrumbs={breadcrumbs}
          ballotStyleId={ballotStyleId}
          election={election}
          contest={contest}
          vote={(vote ?? []) as CandidateVote}
          updateVote={updateVote}
          accessibilityMode={accessibilityMode}
          onOpenWriteInKeyboard={onOpenWriteInKeyboard}
          onCloseWriteInKeyboard={onCloseWriteInKeyboard}
          writeInCharacterLimitAcrossContests={{
            numCharactersAllowed: numWriteInCharactersAllowedAcrossContests,
            numCharactersRemaining:
              numWriteInCharactersAllowedAcrossContests -
              numWriteInCharactersUsedAcrossContests,
          }}
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
