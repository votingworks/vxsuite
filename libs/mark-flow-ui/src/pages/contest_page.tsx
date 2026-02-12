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
  WithAltAudio,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';

import { Contest, ContestProps } from '../components/contest';
import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { BreadcrumbMetadata, Breadcrumbs } from '../components/contest_header';
import { VoterHelpScreenType, VoterScreen } from '../components/voter_screen';
import { numVotesRemaining } from '../utils/vote';

export interface ContestPageProps {
  ballotStyleId?: string;
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
  numWriteInCharactersAllowedAcrossContests?: number;
  VoterHelpScreen?: VoterHelpScreenType;
}

interface ContestParams {
  contestNumber: string;
}

export function useIsReviewMode(): boolean {
  const history = useHistory();
  return history.location.hash === '#review';
}

export function ContestPage(props: ContestPageProps): JSX.Element {
  const { contestNumber } = useParams<ContestParams>();
  const isReviewMode = useIsReviewMode();

  const {
    ballotStyleId,
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
    numWriteInCharactersAllowedAcrossContests,
    VoterHelpScreen,
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
  assert(
    typeof ballotStyleId === 'string',
    'ballotStyleId is required to render ContestPage'
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
        return vote && numVotesRemaining(contest, vote as CandidateVote) === 0;
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

  const viewAllButtonRef = useRef<Button<never>>(null);
  const viewAllUrl = isReviewMode
    ? getReviewPageUrl(contest.id)
    : `${getReviewPageUrl()}?fromContest=${currentContestIndex}`;
  const viewAllButton = (
    <LinkButton
      id={isReviewMode ? PageNavigationButtonId.NEXT : undefined}
      variant={isReviewMode && isVoteComplete ? 'primary' : 'neutral'}
      to={viewAllUrl}
      icon={isReviewMode ? 'Next' : 'ListUnordered'}
      ref={viewAllButtonRef}
    >
      {isReviewMode ? (
        appStrings.buttonReview()
      ) : (
        <WithAltAudio audioText={appStrings.buttonViewAllContests()}>
          {appStrings.buttonViewAll()}
        </WithAltAudio>
      )}
    </LinkButton>
  );

  const handleUpdateVote: ContestProps['updateVote'] = useCallback(
    (contestIdProp: ContestId, voteProp: OptionalVote) => {
      const maxNumSelections = contest.type === 'candidate' ? contest.seats : 1;

      if (isPatDeviceConnected && voteProp?.length === maxNumSelections) {
        if (isReviewMode) {
          viewAllButtonRef?.current?.focus();
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

  const isLastContest = !nextContest;

  return (
    <VoterScreen
      actionButtons={
        isReviewMode ? (
          viewAllButton
        ) : (
          <React.Fragment>
            {!isLastContest && viewAllButton}
            {previousContestButton}
            {nextContestButton}
          </React.Fragment>
        )
      }
      breadcrumbs={
        breadcrumbsMetadata && <Breadcrumbs {...breadcrumbsMetadata} />
      }
      VoterHelpScreen={VoterHelpScreen}
    >
      <Contest
        key={contest.id} // Force a re-mount for every contest to reset scroll state.
        ballotStyleId={ballotStyleId}
        election={electionDefinition.election}
        breadcrumbs={breadcrumbsMetadata}
        contest={contest}
        votes={votes}
        updateVote={handleUpdateVote}
        accessibilityMode={accessibilityMode}
        numWriteInCharactersAllowedAcrossContests={
          numWriteInCharactersAllowedAcrossContests
        }
      />
    </VoterScreen>
  );
}
