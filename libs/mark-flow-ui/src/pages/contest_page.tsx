/* istanbul ignore file - @preserve - tested via Mark/Mark-Scan */
import React, { useCallback, useRef } from 'react';
import { useHistory, useParams } from 'react-router-dom';

import {
  CandidateVote,
  ContestId,
  ElectionDefinition,
  OptionalVote,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import {
  LinkButton,
  appStrings,
  Button,
  PageNavigationButtonId,
  AccessibilityMode,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';

import { Contest, ContestProps } from '../components/contest';
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { BreadcrumbMetadata, Breadcrumbs } from '../components/contest_header';
import { VoterScreen } from '../components/voter_screen';

export interface ContestPageProps {
  contests: ContestsWithMsEitherNeither;
  electionDefinition?: ElectionDefinition;
  accessibilityMode?: AccessibilityMode;
  enableWriteInAtiControllerNavigation?: boolean;
  getContestUrl: (contestIndex: number) => string;
  getStartPageUrl: () => string;
  getReviewPageUrl: (contestId?: ContestId) => string;
  isPatDeviceConnected?: boolean;
  precinctId?: PrecinctId;
  updateVote: ContestProps['updateVote'];
  votes: VotesDict;
}

interface ContestParams {
  contestNumber: string;
}

export function ContestPage(props: ContestPageProps): JSX.Element {
  const { contestNumber } = useParams<ContestParams>();
  const history = useHistory();
  const isReviewMode = history.location.hash === '#review';

  const {
    contests,
    electionDefinition,
    accessibilityMode,
    getContestUrl,
    getStartPageUrl,
    getReviewPageUrl,
    isPatDeviceConnected,
    precinctId,
    updateVote,
    votes,
  } = props;

  // eslint-disable-next-line vx/gts-safe-number-parse
  const currentContestIndex = parseInt(contestNumber, 10);
  const contest = contests[currentContestIndex];

  const prevContestIndex = currentContestIndex - 1;
  const prevContest = contests[prevContestIndex];

  const nextContestIndex = currentContestIndex + 1;
  const nextContest = contests[nextContestIndex];

  assert(
    electionDefinition,
    'electionDefinition is required to render ContestPage'
  );
  assert(
    typeof precinctId === 'string',
    'precinctId is required to render ContestPage'
  );

  const vote = votes[contest.id];

  const breadcrumbsMetadata: BreadcrumbMetadata | undefined = isReviewMode
    ? undefined
    : {
        contestNumber: currentContestIndex + 1,
        ballotContestCount: contests.length,
      };

  const isVoteComplete = (() => {
    switch (contest.type) {
      case 'yesno':
        return !!vote;
      case 'candidate':
        return contest.seats === ((vote as CandidateVote) ?? []).length;
      case 'ms-either-neither':
        return (
          votes[contest.pickOneContestId]?.length === 1 ||
          votes[contest.eitherNeitherContestId]?.[0] ===
            contest.neitherOption.id
        );
      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(contest);
      }
    }
  })();

  const nextContestButtonRef = useRef<Button<never>>(null);
  const nextContestButton = (
    <LinkButton
      key={contest.id}
      id={PageNavigationButtonId.NEXT}
      rightIcon="Next"
      variant={isVoteComplete ? 'primary' : 'neutral'}
      to={nextContest ? getContestUrl(nextContestIndex) : getReviewPageUrl()}
      ref={nextContestButtonRef}
    >
      {appStrings.buttonNext()}
    </LinkButton>
  );

  const reviewButtonRef = useRef<Button<never>>(null);
  const reviewScreenButton = (
    <LinkButton
      rightIcon="Next"
      variant={isVoteComplete ? 'primary' : 'neutral'}
      to={getReviewPageUrl(contest.id)}
      id={PageNavigationButtonId.NEXT}
      ref={reviewButtonRef}
    >
      {appStrings.buttonReview()}
    </LinkButton>
  );

  const handleUpdateVote: ContestProps['updateVote'] = useCallback(
    (contestIdProp: ContestId, voteProp: OptionalVote) => {
      const maxNumSelections = contest.type === 'candidate' ? contest.seats : 1;

      if (isPatDeviceConnected && voteProp?.length === maxNumSelections) {
        if (isReviewMode) {
          reviewButtonRef?.current?.focus();
        } else {
          nextContestButtonRef?.current?.focus();
        }
      }

      updateVote(contestIdProp, voteProp);
    },
    [updateVote, isReviewMode, contest, isPatDeviceConnected]
  );

  const previousContestButton = (
    <LinkButton
      icon="Previous"
      id={PageNavigationButtonId.PREVIOUS}
      to={prevContest ? getContestUrl(prevContestIndex) : getStartPageUrl()}
    >
      {/* TODO(kofi): Maybe something like "Previous" would translate better in this context? */}
      {appStrings.buttonBack()}
    </LinkButton>
  );

  return (
    <VoterScreen
      actionButtons={
        <React.Fragment>
          {isReviewMode ? (
            reviewScreenButton
          ) : (
            <React.Fragment>
              {previousContestButton}
              {nextContestButton}
            </React.Fragment>
          )}
        </React.Fragment>
      }
      breadcrumbs={
        breadcrumbsMetadata && <Breadcrumbs {...breadcrumbsMetadata} />
      }
    >
      <Contest
        key={contest.id} // Force a re-mount for every contest to reset scroll state.
        election={electionDefinition.election}
        breadcrumbs={breadcrumbsMetadata}
        contest={contest}
        votes={votes}
        updateVote={handleUpdateVote}
        accessibilityMode={accessibilityMode}
      />
    </VoterScreen>
  );
}
