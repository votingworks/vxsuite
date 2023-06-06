import { CandidateVote } from '@votingworks/types';
import { Screen, Prose, P, Font, LinkButton } from '@votingworks/ui';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import React, { useContext } from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { useHistory, useParams } from 'react-router-dom';
import { Contest as MarkFlowContest } from '@votingworks/mark-flow-ui';
import styled from 'styled-components';
import { BallotContext } from '../contexts/ballot_context';
import { ElectionInfo } from '../components/election_info';
import { Sidebar } from '../components/sidebar';
import { screenOrientation } from '../lib/screen_orientation';
import { ButtonFooter } from '../components/button_footer';
import { DisplaySettingsButton } from '../components/display_settings_button';

interface ContestParams {
  contestNumber: string;
}

const Breadcrumbs = styled.div`
  padding: 0 0.5rem;
`;

export function ContestPage(): JSX.Element {
  const { contestNumber } = useParams<ContestParams>();
  const history = useHistory();
  const isReviewMode = history.location.hash === '#review';

  const {
    ballotStyleId,
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
  const { isLandscape, isPortrait } = screenOrientation(machineConfig);

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
      large={isPortrait}
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
    <Screen navRight={isLandscape}>
      {isPortrait && (
        <Breadcrumbs>
          <P align="right">
            Contest <Font weight="bold">{ballotContestNumber}</Font> of{' '}
            <Font weight="bold">{ballotContestsLength}</Font>
          </P>
        </Breadcrumbs>
      )}
      <MarkFlowContest
        election={electionDefinition.election}
        contest={contest}
        votes={votes}
        updateVote={updateVote}
      />
      {isPortrait ? (
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
      ) : (
        <Sidebar
          footer={
            <React.Fragment>
              <ButtonFooter>{settingsButton}</ButtonFooter>
              <ElectionInfo
                electionDefinition={electionDefinition}
                ballotStyleId={ballotStyleId}
                precinctSelection={singlePrecinctSelectionFor(precinctId)}
                horizontal
              />
            </React.Fragment>
          }
        >
          <Prose>
            <P align="center">
              Contest <Font weight="bold">{ballotContestNumber}</Font> of{' '}
              <Font weight="bold">{ballotContestsLength}</Font>
            </P>
            {isReviewMode ? (
              <P>{reviewScreenButton}</P>
            ) : (
              <React.Fragment>
                <P>{nextContestButton}</P>
                <P>{previousContestButton}</P>
              </React.Fragment>
            )}
          </Prose>
        </Sidebar>
      )}
    </Screen>
  );
}
