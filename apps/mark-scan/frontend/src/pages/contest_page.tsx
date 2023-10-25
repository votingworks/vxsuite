// TODO(kofi): Consolidate with VxMark/ContestPage
import { CandidateVote } from '@votingworks/types';
import { Screen, LinkButton, appStrings } from '@votingworks/ui';
import React, { useContext } from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { useHistory, useParams } from 'react-router-dom';
import {
  DisplaySettingsButton,
  Contest as MarkFlowContest,
} from '@votingworks/mark-flow-ui';
import { BallotContext } from '../contexts/ballot_context';
import { screenOrientation } from '../lib/screen_orientation';
import { ButtonFooter } from '../components/button_footer';

interface ContestParams {
  contestNumber: string;
}

export function ContestPage(): JSX.Element {
  const { contestNumber } = useParams<ContestParams>();
  const history = useHistory();
  const isReviewMode = history.location.hash === '#review';

  const {
    contests,
    electionDefinition,
    machineConfig,
    precinctId,
    updateVote,
    votes,
  } = useContext(BallotContext);

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
  const { isLandscape } = screenOrientation(machineConfig);

  const vote = votes[contest.id];

  const ballotContestNumber = currentContestIndex + 1;
  const ballotContestsLength = contests.length;

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
      /* istanbul ignore next */
      default:
        throwIllegalValue(contest);
    }
  })();

  const nextContestButton = (
    <LinkButton
      id="next"
      variant={isVoteComplete ? 'next' : 'nextSecondary'}
      aria-label="next contest"
      to={nextContest ? `/contests/${nextContestIndex}` : '/review'}
    >
      {appStrings.buttonNext()}
    </LinkButton>
  );

  const previousContestButton = (
    <LinkButton
      variant="previous"
      id="previous"
      aria-label="previous contest"
      to={prevContest ? `/contests/${prevContestIndex}` : '/'}
    >
      {/* TODO(kofi): Maybe something like "Previous" would translate better in this context? */}
      {appStrings.buttonBack()}
    </LinkButton>
  );

  const reviewScreenButton = (
    <LinkButton
      variant={isVoteComplete ? 'next' : 'nextSecondary'}
      to={`/review#contest-${contest.id}`}
      id="next"
    >
      {appStrings.buttonReview()}
    </LinkButton>
  );

  const settingsButton = <DisplaySettingsButton />;

  return (
    <Screen navRight={isLandscape}>
      <MarkFlowContest
        breadcrumbs={{
          ballotContestCount: ballotContestsLength,
          contestNumber: ballotContestNumber,
        }}
        election={electionDefinition.election}
        contest={contest}
        votes={votes}
        updateVote={updateVote}
      />
      <ButtonFooter>
        {isReviewMode ? (
          <React.Fragment>
            {settingsButton}
            {reviewScreenButton}
          </React.Fragment>
        ) : (
          <React.Fragment>
            {previousContestButton}
            {settingsButton}
            {nextContestButton}
          </React.Fragment>
        )}
      </ButtonFooter>
    </Screen>
  );
}
