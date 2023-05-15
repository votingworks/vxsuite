import pluralize from 'pluralize';
import React, { useContext } from 'react';
import styled from 'styled-components';
import {
  CandidateVote,
  YesNoVote,
  OptionalYesNoVote,
  getCandidatePartiesDescription,
} from '@votingworks/types';
import {
  Caption,
  Card,
  ContestVote,
  DecoyButton,
  DisplayTextForYesOrNo,
  H2,
  Icons,
  LinkButton,
  Main,
  Prose,
  Screen,
  P,
  VoterContestSummary,
  H1,
  WithScrollButtons,
} from '@votingworks/ui';

import {
  getSingleYesNoVote,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import {
  CandidateContestResultInterface,
  MsEitherNeitherContestResultInterface,
  YesNoContestResultInterface,
} from '../config/types';

import { BallotContext } from '../contexts/ballot_context';
import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { ButtonFooter } from '../components/button_footer';
import { screenOrientation } from '../lib/screen_orientation';
import { getContestDistrictName } from '../utils/ms_either_neither_contests';
import { DisplaySettingsButton } from '../components/display_settings_button';

const ContentHeader = styled.div`
  padding: 0.5rem 0.75rem 0;
`;

const Contest = styled.button`
  display: flex;
  margin: 0 0 0.75rem;
  border: none;
  background: none;
  width: 100%; /* reset Button default here at component rather than pass 'fullWidth' param. */
  padding: 0;
  white-space: normal; /* reset Button default */
  color: inherit;
  button& {
    cursor: pointer;
    text-align: left;
  }
  &:last-child {
    margin-bottom: 0;
  }
`;

function CandidateContestResult({
  contest,
  vote = [],
  election,
}: CandidateContestResultInterface): JSX.Element {
  const remainingChoices = contest.seats - vote.length;

  return (
    <VoterContestSummary
      districtName={getContestDistrictName(election, contest)}
      title={contest.title}
      titleType="h2"
      undervoteWarning={
        remainingChoices > 0
          ? vote.length === 0
            ? 'You may still vote in this contest.'
            : `You may still vote for ${remainingChoices} more ${pluralize(
                'candidate',
                remainingChoices
              )}.`
          : undefined
      }
      votes={vote.map((candidate): ContestVote => {
        const partiesDescription = getCandidatePartiesDescription(
          election,
          candidate
        );

        return {
          caption: candidate.isWriteIn ? '(write-in)' : partiesDescription,
          label: candidate.name,
        };
      })}
    />
  );
}

function YesNoContestResult({
  vote,
  contest,
  election,
}: YesNoContestResultInterface): JSX.Element {
  const yesNo = getSingleYesNoVote(vote);

  const votes: ContestVote[] = [];
  if (yesNo) {
    votes.push({
      label: DisplayTextForYesOrNo[yesNo],
    });
  }

  return (
    <VoterContestSummary
      districtName={getContestDistrictName(election, contest)}
      title={contest.title}
      titleType="h2"
      undervoteWarning={
        !yesNo ? 'You may still vote in this contest.' : undefined
      }
      votes={votes}
    />
  );
}

function MsEitherNeitherContestResult({
  contest,
  election,
  eitherNeitherContestVote,
  pickOneContestVote,
}: MsEitherNeitherContestResultInterface): JSX.Element {
  /* istanbul ignore next */
  const eitherNeitherVote = eitherNeitherContestVote?.[0];
  /* istanbul ignore next */
  const pickOneVote = pickOneContestVote?.[0];

  const votes: ContestVote[] = [];
  if (eitherNeitherVote) {
    votes.push({
      label:
        eitherNeitherVote === 'yes'
          ? contest.eitherOption.label
          : contest.neitherOption.label,
    });
  }
  if (pickOneVote) {
    votes.push({
      label:
        pickOneVote === 'yes'
          ? contest.firstOption.label
          : contest.secondOption.label,
    });
  }

  return (
    <VoterContestSummary
      districtName={getContestDistrictName(election, contest)}
      title={contest.title}
      titleType="h2"
      undervoteWarning={
        votes.length < 2 ? 'You may still vote in this contest.' : undefined
      }
      votes={votes}
    />
  );
}

const SidebarSpacer = styled.div`
  height: 90px;
`;

export function ReviewPage(): JSX.Element {
  const {
    contests,
    ballotStyleId,
    electionDefinition,
    machineConfig,
    precinctId,
    votes,
  } = useContext(BallotContext);
  const { isLandscape, isPortrait } = screenOrientation(machineConfig);

  assert(
    electionDefinition,
    'electionDefinition is required to render ReviewPage'
  );
  assert(
    typeof precinctId !== 'undefined',
    'precinctId is required to render ReviewPage'
  );
  const { election } = electionDefinition;

  const printMyBallotButton = (
    <LinkButton to="/print" id="next" variant="done">
      Print My Ballot
    </LinkButton>
  );

  const settingsButton = <DisplaySettingsButton />;

  return (
    <Screen navRight={isLandscape}>
      <Main flexColumn>
        <ContentHeader>
          <Prose id="audiofocus">
            <H1>
              <span aria-label="Review Your Votes.">Review Your Votes</span>
              <span className="screen-reader-only">
                To review your votes, advance through the ballot contests using
                the up and down buttons. To change your vote in any contest, use
                the select button to navigate to that contest. When you are
                finished making your ballot selections and ready to print your
                ballot, use the right button to print your ballot.
              </span>
            </H1>
          </Prose>
        </ContentHeader>
        <WithScrollButtons>
          {contests.map((contest, i) => (
            <LinkButton
              component={Contest}
              id={`contest-${contest.id}`}
              key={contest.id}
              to={`/contests/${i}#review`}
            >
              <Card
                footerAlign="right"
                footer={
                  <DecoyButton aria-label="Press the select button to change your votes for this contest.">
                    <Caption>
                      <Icons.Edit /> Change
                    </Caption>
                  </DecoyButton>
                }
              >
                {contest.type === 'candidate' && (
                  <CandidateContestResult
                    contest={contest}
                    election={election}
                    precinctId={precinctId}
                    vote={votes[contest.id] as CandidateVote}
                  />
                )}
                {contest.type === 'yesno' && (
                  <YesNoContestResult
                    vote={votes[contest.id] as YesNoVote}
                    contest={contest}
                    election={election}
                  />
                )}
                {contest.type === 'ms-either-neither' && (
                  <MsEitherNeitherContestResult
                    contest={contest}
                    election={election}
                    eitherNeitherContestVote={
                      votes[contest.eitherNeitherContestId] as OptionalYesNoVote
                    }
                    pickOneContestVote={
                      votes[contest.pickOneContestId] as OptionalYesNoVote
                    }
                  />
                )}
              </Card>
            </LinkButton>
          ))}
        </WithScrollButtons>
      </Main>
      {isPortrait ? (
        <ButtonFooter>
          {settingsButton}
          {printMyBallotButton}
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
          <SidebarSpacer />
          <Prose>
            <H2 aria-hidden>Review Votes</H2>
            <P>Confirm your votes are correct.</P>
            <P>{printMyBallotButton}</P>
          </Prose>
        </Sidebar>
      )}
    </Screen>
  );
}
