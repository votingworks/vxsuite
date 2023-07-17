import { CandidateVote } from '@votingworks/types';
import { Screen, LinkButton, useScreenInfo } from '@votingworks/ui';
import React, { useContext } from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { useHistory, useParams } from 'react-router-dom';
import { Contest as MarkFlowContest } from '@votingworks/mark-flow-ui';
import { BallotContext } from '../contexts/ballot_context';
import { ButtonFooter } from '../components/button_footer';
import { DisplaySettingsButton } from '../components/display_settings_button';

interface ContestParams {
  contestNumber: string;
}

export function ContestPage(): JSX.Element {
  const { contestNumber } = useParams<ContestParams>();
  const history = useHistory();
  const isReviewMode = history.location.hash === '#review';

  const { contests, electionDefinition, precinctId, updateVote, votes } =
    useContext(BallotContext);

  const screenInfo = useScreenInfo();

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
          votes[contest.eitherNeitherContestId]?.[0] === 'no'
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
      Next
    </LinkButton>
  );

  const previousContestButton = (
    <LinkButton
      variant="previous"
      id="previous"
      aria-label="previous contest"
      to={prevContest ? `/contests/${prevContestIndex}` : '/'}
    >
      Back
    </LinkButton>
  );

  const reviewScreenButton = (
    <LinkButton
      large
      variant={isVoteComplete ? 'next' : 'nextSecondary'}
      to={`/review#contest-${contest.id}`}
      id="next"
    >
      Review
    </LinkButton>
  );

  const settingsButton = <DisplaySettingsButton />;

  return (
    <Screen navRight={!screenInfo.isPortrait}>
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
