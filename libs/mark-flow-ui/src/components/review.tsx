import React from 'react';
import styled from 'styled-components';
import {
  CandidateVote,
  YesNoVote,
  OptionalYesNoVote,
  Election,
  VotesDict,
  PrecinctId,
  getContestDistrict,
} from '@votingworks/types';
import {
  Caption,
  Card,
  ContestVote,
  DecoyButton,
  Icons,
  VoterContestSummary,
  Button,
  AudioOnly,
  appStrings,
  CandidatePartyList,
  electionStrings,
} from '@votingworks/ui';

import { getSingleYesNoVote } from '@votingworks/utils';
import {
  CandidateContestResultInterface,
  MsEitherNeitherContestResultInterface,
  YesNoContestResultInterface,
} from '../config/types';

import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';

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
  const district = getContestDistrict(election, contest);
  const remainingChoices = contest.seats - vote.length;

  return (
    <VoterContestSummary
      districtName={electionStrings.districtName(district)}
      title={electionStrings.contestTitle(contest)}
      titleType="h2"
      undervoteWarning={
        remainingChoices > 0 ? (
          vote.length === 0 ? (
            appStrings.undervoteWarningNoVotes()
          ) : (
            <React.Fragment>
              {appStrings.labelNumVotesRemaining()}{' '}
              {appStrings.number(remainingChoices)}
            </React.Fragment>
          )
        ) : undefined
      }
      votes={vote.map(
        (candidate): ContestVote => ({
          caption: candidate.isWriteIn ? (
            appStrings.labelWriteInParenthesized()
          ) : (
            <CandidatePartyList
              candidate={candidate}
              electionParties={election.parties}
            />
          ),
          id: candidate.id,
          label: electionStrings.candidateName(candidate),
        })
      )}
    />
  );
}

function YesNoContestResult({
  vote,
  contest,
  election,
}: YesNoContestResultInterface): JSX.Element {
  const district = getContestDistrict(election, contest);
  const yesNo = getSingleYesNoVote(vote);
  const selectedOption =
    yesNo === contest.yesOption.id ? contest.yesOption : contest.noOption;

  const votes: ContestVote[] = selectedOption
    ? [
        {
          id: selectedOption.id,
          label: electionStrings.contestOptionLabel(selectedOption),
        },
      ]
    : [];

  return (
    <VoterContestSummary
      districtName={electionStrings.districtName(district)}
      title={electionStrings.contestTitle(contest)}
      titleType="h2"
      undervoteWarning={
        !yesNo ? appStrings.undervoteWarningNoVotes() : undefined
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
  const district = getContestDistrict(election, contest);
  /* istanbul ignore next */
  const eitherNeitherVote = eitherNeitherContestVote?.[0];
  /* istanbul ignore next */
  const pickOneVote = pickOneContestVote?.[0];

  const votes: ContestVote[] = [];
  if (eitherNeitherVote) {
    votes.push({
      id: eitherNeitherVote,
      label: electionStrings.contestOptionLabel(
        eitherNeitherVote === contest.eitherOption.id
          ? contest.eitherOption
          : contest.neitherOption
      ),
    });
  }
  if (pickOneVote) {
    votes.push({
      id: pickOneVote,
      label: electionStrings.contestOptionLabel(
        pickOneVote === contest.firstOption.id
          ? contest.firstOption
          : contest.secondOption
      ),
    });
  }

  return (
    <VoterContestSummary
      data-testid={`contest-${contest.id}`}
      districtName={electionStrings.districtName(district)}
      title={electionStrings.contestTitle(contest)}
      titleType="h2"
      undervoteWarning={
        votes.length < 2 ? appStrings.undervoteWarningNoVotes() : undefined
      }
      votes={votes}
    />
  );
}

export interface ReviewProps {
  election: Election;
  precinctId: PrecinctId;
  contests: ContestsWithMsEitherNeither;
  votes: VotesDict;
  returnToContest?: (contestId: string) => void;
  selectionsAreEditable?: boolean;
}

export function Review({
  election,
  precinctId,
  contests,
  votes,
  returnToContest,
  selectionsAreEditable = true,
}: ReviewProps): JSX.Element {
  return (
    <React.Fragment>
      {contests.map((contest) => (
        <Button
          component={Contest}
          id={`contest-${contest.id}`}
          key={contest.id}
          onPress={() => {
            if (!returnToContest) {
              return;
            }
            returnToContest(contest.id);
          }}
        >
          <Card
            footerAlign={selectionsAreEditable ? 'right' : undefined}
            footer={
              selectionsAreEditable && (
                <DecoyButton>
                  <Caption>
                    {/*
                     * TODO(kofi): Add a <NoAudio> wrapper component for
                     * display-only strings that shouldn't be read out loud by
                     * the speech engine.
                     */}
                    <Icons.Edit /> {appStrings.buttonChange()}
                  </Caption>
                  <AudioOnly>
                    {appStrings.buttonBmdReviewCardAction()}
                  </AudioOnly>
                </DecoyButton>
              )
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
        </Button>
      ))}
    </React.Fragment>
  );
}
