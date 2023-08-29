import pluralize from 'pluralize';
import React from 'react';
import styled from 'styled-components';
import {
  CandidateVote,
  YesNoVote,
  OptionalYesNoVote,
  getCandidatePartiesDescription,
  Election,
  VotesDict,
  PrecinctId,
} from '@votingworks/types';
import {
  Caption,
  Card,
  ContestVote,
  DecoyButton,
  Icons,
  VoterContestSummary,
  Button,
} from '@votingworks/ui';

import { getSingleYesNoVote } from '@votingworks/utils';
import {
  CandidateContestResultInterface,
  MsEitherNeitherContestResultInterface,
  YesNoContestResultInterface,
} from '../config/types';

import {
  ContestsWithMsEitherNeither,
  getContestDistrictName,
} from '../utils/ms_either_neither_contests';

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

  const votes: ContestVote[] = yesNo
    ? [
        {
          label:
            yesNo === 'yes' ? contest.yesOption.label : contest.noOption.label,
        },
      ]
    : [];

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
      data-testid={`contest-${contest.id}`}
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
                <DecoyButton aria-label="Press the select button to change your votes for this contest.">
                  <Caption>
                    <Icons.Edit /> Change
                  </Caption>
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
