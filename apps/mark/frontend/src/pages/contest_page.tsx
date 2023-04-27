import styled from 'styled-components';

import { CandidateVote, OptionalYesNoVote } from '@votingworks/types';
import { LinkButton, Screen, Prose, Text, P } from '@votingworks/ui';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import pluralize from 'pluralize';
import React, { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { assert } from '@votingworks/basics';
import { ordinal } from '../utils/ordinal';

import { BallotContext } from '../contexts/ballot_context';

import { CandidateContest } from '../components/candidate_contest';
import { ElectionInfo } from '../components/election_info';
import { Sidebar } from '../components/sidebar';
import { YesNoContest } from '../components/yes_no_contest';
import { TextIcon } from '../components/text_icon';
import { MsEitherNeitherContest } from '../components/ms_either_neither_contest';
import { screenOrientation } from '../lib/screen_orientation';
import {
  ButtonFooter,
  ButtonFooterLandscape,
} from '../components/button_footer';
import { SettingsButton } from '../components/settings_button';

interface ContestParams {
  contestNumber: string;
}

export function ContestPage(): JSX.Element {
  const { contestNumber } = useParams<ContestParams>();
  const isReviewMode = window.location.hash === '#review';
  const {
    ballotStyleId,
    contests,
    electionDefinition,
    machineConfig,
    precinctId,
    setUserSettings,
    updateVote,
    votes,
  } = useContext(BallotContext);
  assert(
    electionDefinition,
    'electionDefinition is required to render ContestPage'
  );
  assert(
    typeof precinctId === 'string',
    'precinctId is required to render ContestPage'
  );
  const { isLandscape, isPortrait } = screenOrientation(machineConfig);
  function showSettingsModal() {
    return setUserSettings({ showSettingsModal: true });
  }

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

  const Breadcrumbs = styled.div`
    padding: 30px 30px 0;
  `;

  const nextContestButton = (
    <LinkButton
      large
      id="next"
      variant={isVoteComplete ? 'primary' : 'regular'}
      aria-label="next contest"
      to={nextContest ? `/contests/${nextContestIndex}` : '/review'}
    >
      <TextIcon arrowRight white={isVoteComplete}>
        Next
      </TextIcon>
    </LinkButton>
  );

  const previousContestButton = (
    <LinkButton
      small={isLandscape}
      large={isPortrait}
      id="previous"
      aria-label="previous contest"
      to={prevContest ? `/contests/${prevContestIndex}` : '/'}
    >
      <TextIcon small={isLandscape} arrowLeft>
        Back
      </TextIcon>
    </LinkButton>
  );

  const reviewScreenButton = (
    <LinkButton
      large
      variant={isVoteComplete ? 'primary' : 'regular'}
      to={`/review#contest-${contest.id}`}
      id="next"
    >
      <TextIcon arrowRight white={isVoteComplete}>
        Review
      </TextIcon>
    </LinkButton>
  );

  const settingsButton = (
    <SettingsButton large={isPortrait} onPress={showSettingsModal} />
  );

  return (
    <Screen navRight={isLandscape}>
      {isPortrait && (
        <Breadcrumbs>
          <Prose>
            <Text small>
              This is the{' '}
              <strong>{ordinal(ballotContestNumber)} contest</strong> of{' '}
              {pluralize('contest', ballotContestsLength, true)} on your ballot.
            </Text>
          </Prose>
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
            reviewScreenButton
          ) : (
            <React.Fragment>
              {nextContestButton}
              {previousContestButton}
            </React.Fragment>
          )}
          {settingsButton}
        </ButtonFooter>
      ) : (
        <Sidebar
          footer={
            <React.Fragment>
              <ButtonFooterLandscape>{settingsButton}</ButtonFooterLandscape>
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
            <Text center>
              This is the <strong>{ordinal(currentContestIndex + 1)}</strong> of{' '}
              {pluralize('contest', contests.length, true)}.
            </Text>
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
