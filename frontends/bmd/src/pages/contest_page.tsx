import styled from 'styled-components';

import { CandidateVote, OptionalYesNoVote } from '@votingworks/types';
import { LinkButton, Screen, Prose, Text, Button } from '@votingworks/ui';
import { assert, singlePrecinctSelectionFor } from '@votingworks/utils';
import pluralize from 'pluralize';
import React, { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

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

  const NextContestButton = (
    <LinkButton
      large
      id="next"
      primary={isVoteComplete}
      aria-label="next contest"
      to={nextContest ? `/contests/${nextContestIndex}` : '/review'}
    >
      <TextIcon arrowRight white={isVoteComplete}>
        Next
      </TextIcon>
    </LinkButton>
  );

  const PreviousContestButton = (
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

  const ReviewScreenButton = (
    <LinkButton
      large
      primary={isVoteComplete}
      to={`/review#contest-${contest.id}`}
      id="next"
    >
      <TextIcon arrowRight white={isVoteComplete}>
        Review
      </TextIcon>
    </LinkButton>
  );

  const Breadcrumbs = styled.div`
    padding: 30px 30px 0;
  `;

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
          {isReviewMode ? ReviewScreenButton : NextContestButton}
          {!isReviewMode && PreviousContestButton}
          {/* <Button large onPress={() => {}} aria-label="Change Language">
            English
          </Button> */}
          {/* <SegmentedButton>
            <Button
              large
              primary
              onPress={() => {}}
              aria-label="Change Language"
            >
              Español
            </Button>
            <Button large onPress={() => {}} aria-label="Change Language">
              English
            </Button>
          </SegmentedButton> */}
          <Button
            large
            onPress={() => setUserSettings({ showSettingsModal: true })}
            aria-label="Change Settings"
          >
            Settings
          </Button>
        </ButtonFooter>
      ) : (
        <Sidebar
          footer={
            <React.Fragment>
              <ButtonFooterLandscape>
                {/* <SegmentedButton>
                  <Button
                    primary
                    onPress={() => {}}
                    aria-label="Change Language"
                  >
                    Español
                  </Button>
                  <Button onPress={() => {}} aria-label="Change Language">
                    English
                  </Button>
                </SegmentedButton> */}
                {/* <Button onPress={() => {}} aria-label="Change Language">
                  English
                </Button> */}
                <Button
                  onPress={() => setUserSettings({ showSettingsModal: true })}
                  aria-label="Change Settings"
                >
                  Settings
                </Button>
              </ButtonFooterLandscape>
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
              <p>{ReviewScreenButton}</p>
            ) : (
              <React.Fragment>
                <p>{NextContestButton}</p>
                <p>{PreviousContestButton}</p>
              </React.Fragment>
            )}
          </Prose>
        </Sidebar>
      )}
    </Screen>
  );
}
