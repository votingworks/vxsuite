import styled from 'styled-components';

import { CandidateVote, OptionalYesNoVote } from '@votingworks/types';
import { LinkButton, Screen, Prose, P, Font } from '@votingworks/ui';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import React, { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { assert } from '@votingworks/basics';

import { BallotContext } from '../contexts/ballot_context';

import { CandidateContest } from '../components/candidate_contest';
import { ElectionInfo } from '../components/election_info';
import { Sidebar } from '../components/sidebar';
import { YesNoContest } from '../components/yes_no_contest';
import { MsEitherNeitherContest } from '../components/ms_either_neither_contest';
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
  const isReviewMode = window.location.hash === '#review';
  const {
    ballotStyleId,
    contests,
    machineConfig,
    precinctId,
    updateVote,
    votes,
  } = useContext(BallotContext);
  assert(
    typeof precinctId === 'string',
    'precinctId is required to render ContestPage'
  );
  const { isLandscape, isPortrait } = screenOrientation(machineConfig);

  // eslint-disable-next-line vx/gts-safe-number-parse
  const currentContestIndex = parseInt(contestNumber, 10);
  const contest = contests[currentContestIndex];

  const vote = votes[contest.id];

  const [isVoteComplete, setIsVoteComplete] = useState(false);

  const prevContestIndex = currentContestIndex - 1;
  const prevContest = contests[prevContestIndex];

  const nextContestIndex = currentContestIndex + 1;
  const nextContest = contests[nextContestIndex];

  const ballotContestNumber = currentContestIndex + 1;
  const ballotContestsLength = contests.length;

  useEffect(() => {
    function calculateIsVoteComplete() {
      /* istanbul ignore else */
      if (contest.type === 'yesno') {
        setIsVoteComplete(!!vote);
      } else if (contest.type === 'candidate') {
        setIsVoteComplete(
          contest.seats === ((vote as CandidateVote) ?? []).length
        );
      } else if (contest.type === 'ms-either-neither') {
        setIsVoteComplete(
          votes[contest.pickOneContestId]?.length === 1 ||
            votes[contest.eitherNeitherContestId]?.[0] === 'no'
        );
      }
    }
    calculateIsVoteComplete();
  }, [contest, vote, votes]);

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
      {contest.type === 'candidate' && (
        <CandidateContest
          aria-live="assertive"
          key={contest.id}
          contest={contest}
          vote={(vote ?? []) as CandidateVote}
          updateVote={updateVote}
        />
      )}
      {contest.type === 'yesno' && (
        <YesNoContest
          key={contest.id}
          contest={contest}
          vote={vote as OptionalYesNoVote}
          updateVote={updateVote}
        />
      )}
      {contest.type === 'ms-either-neither' && (
        <MsEitherNeitherContest
          key={contest.id}
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
