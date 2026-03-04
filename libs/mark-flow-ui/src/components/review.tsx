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
  ContestId,
  BallotStyle,
  StraightPartyContest,
  StraightPartyVote,
  getCandidateVoteSortedForBallotStyleRotation,
} from '@votingworks/types';
import { find } from '@votingworks/basics';
import {
  Caption,
  Card,
  ContestVote,
  Icons,
  VoterContestSummary,
  Button,
  appStrings,
  CandidatePartyList,
  electionStrings,
  NumberString,
  WithAltAudio,
  AssistiveTechInstructions,
  AudioOnly,
  Font,
} from '@votingworks/ui';

import { getSingleYesNoVote } from '@votingworks/utils';
import {
  CandidateContestResultInterface,
  MsEitherNeitherContestResultInterface,
  YesNoContestResultInterface,
} from '../config/types';

import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { WriteInCandidateName } from './write_in_candidate_name';
import { numVotesRemaining } from '../utils/vote';
import { getIndirectCandidateIds } from '../utils/straight_party_votes';

const Contest = styled.div`
  display: block;
  margin: 0 0 0.75rem;
  border: none;
  background: none;
  width: 100%;
  padding: 0;
  white-space: normal;
  color: inherit;

  button& {
    cursor: pointer;
    text-align: left;
  }
`;

function CandidateContestResult({
  contest,
  vote = [],
  votes,
  election,
  selectionsAreEditable,
  ballotStyle,
}: CandidateContestResultInterface): JSX.Element {
  const district = getContestDistrict(election, contest);

  const indirectCandidateIds = votes
    ? getIndirectCandidateIds(election, votes, contest)
    : new Set<string>();
  const remainingChoices =
    numVotesRemaining(contest, vote) - indirectCandidateIds.size;

  const noVotesString = selectionsAreEditable
    ? appStrings.warningNoVotesForContest()
    : appStrings.noteBallotContestNoSelection();

  const orderedVotes = getCandidateVoteSortedForBallotStyleRotation({
    inputVote: vote,
    contest,
    ballotStyle,
  });

  return (
    <VoterContestSummary
      districtName={electionStrings.districtName(district)}
      subtitle={contest.termDescription && electionStrings.contestTerm(contest)}
      title={electionStrings.contestTitle(contest)}
      titleType="h2"
      undervoteWarning={
        remainingChoices > 0 ? (
          vote.length === 0 && indirectCandidateIds.size === 0 ? (
            noVotesString
          ) : (
            <React.Fragment>
              {appStrings.labelNumVotesUnused()}{' '}
              <NumberString value={remainingChoices} />
            </React.Fragment>
          )
        ) : undefined
      }
      note={
        indirectCandidateIds.size > 0
          ? appStrings.noteStraightPartyAffectsContest()
          : undefined
      }
      votes={orderedVotes.map(
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
          partyIds: candidate.partyIds,
          label: candidate.isWriteIn ? (
            <Font breakWord>
              <AudioOnly>
                <WriteInCandidateName name={candidate.name} />
              </AudioOnly>
              {candidate.name}
            </Font>
          ) : (
            electionStrings.candidateName(candidate)
          ),
        })
      )}
    />
  );
}

function YesNoContestResult({
  vote,
  contest,
  election,
  selectionsAreEditable,
}: YesNoContestResultInterface): JSX.Element {
  const district = getContestDistrict(election, contest);
  const yesNo = getSingleYesNoVote(vote);
  const selectedOption =
    yesNo === contest.yesOption.id
      ? contest.yesOption
      : yesNo === contest.noOption.id
      ? contest.noOption
      : null;

  const votes: ContestVote[] = selectedOption
    ? [
        {
          id: selectedOption.id,
          label: electionStrings.contestOptionLabel(selectedOption),
        },
      ]
    : [];

  const noVotesString = selectionsAreEditable
    ? appStrings.warningNoVotesForContest()
    : appStrings.noteBallotContestNoSelection();

  return (
    <VoterContestSummary
      districtName={electionStrings.districtName(district)}
      title={electionStrings.contestTitle(contest)}
      titleType="h2"
      undervoteWarning={!yesNo ? noVotesString : undefined}
      votes={votes}
    />
  );
}

function MsEitherNeitherContestResult({
  contest,
  election,
  eitherNeitherContestVote,
  pickOneContestVote,
  selectionsAreEditable,
}: MsEitherNeitherContestResultInterface): JSX.Element {
  const district = getContestDistrict(election, contest);
  /* istanbul ignore next - @preserve */
  const eitherNeitherVote = eitherNeitherContestVote?.[0];
  /* istanbul ignore next - @preserve */
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

  const noVotesString = selectionsAreEditable
    ? appStrings.warningNoVotesForContest()
    : appStrings.noteBallotContestNoSelection();

  return (
    <VoterContestSummary
      data-testid={`contest-${contest.id}`}
      districtName={electionStrings.districtName(district)}
      title={electionStrings.contestTitle(contest)}
      titleType="h2"
      undervoteWarning={votes.length < 2 ? noVotesString : undefined}
      votes={votes}
    />
  );
}

interface StraightPartyContestResultProps {
  contest: StraightPartyContest;
  election: Election;
  vote?: StraightPartyVote;
  selectionsAreEditable?: boolean;
}

function StraightPartyContestResult({
  contest,
  election,
  vote,
  selectionsAreEditable,
}: StraightPartyContestResultProps): JSX.Element {
  const selectedPartyId = vote?.length === 1 ? vote[0] : undefined;
  const selectedParty = selectedPartyId
    ? find(election.parties, (p) => p.id === selectedPartyId)
    : undefined;

  const votes: ContestVote[] = selectedParty
    ? [
        {
          id: selectedParty.id,
          label: electionStrings.partyFullName(selectedParty),
        },
      ]
    : [];

  const noVotesString = selectionsAreEditable
    ? appStrings.warningNoVotesForContest()
    : appStrings.noteBallotContestNoSelection();

  return (
    <VoterContestSummary
      title={electionStrings.contestTitle(contest)}
      titleType="h2"
      undervoteWarning={!selectedParty ? noVotesString : undefined}
      votes={votes}
    />
  );
}

export interface ReviewProps {
  election: Election;
  precinctId: PrecinctId;
  ballotStyle: BallotStyle;
  contests: ContestsWithMsEitherNeither;
  votes: VotesDict;
  returnToContest?: (contestId: string) => void;
  selectionsAreEditable?: boolean;
}

export function Review({
  election,
  precinctId,
  ballotStyle,
  contests,
  votes,
  returnToContest,
  selectionsAreEditable = true,
}: ReviewProps): JSX.Element {
  function onChangeClick(contestId: ContestId) {
    if (!returnToContest) {
      return;
    }
    returnToContest(contestId);
  }

  return (
    <React.Fragment>
      {contests.map((contest) => (
        <Contest
          tabIndex={0}
          role="button"
          id={`contest-${contest.id}`}
          data-testid={`contest-wrapper-${contest.id}`}
          key={contest.id}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              // Default behavior for Space key is to scroll and should be prevented.
              // See code example at https://www.w3.org/WAI/ARIA/apg/patterns/button/examples/button/
              event.preventDefault();
              onChangeClick(contest.id);
            }
          }}
          onClick={() => onChangeClick(contest.id)}
        >
          <Card
            footerAlign={selectionsAreEditable ? 'right' : undefined}
            footer={
              selectionsAreEditable && (
                <Button tabIndex={-1} onPress={() => onChangeClick(contest.id)}>
                  <Caption
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <WithAltAudio
                      audioText={
                        <AssistiveTechInstructions
                          controllerString={appStrings.buttonBmdReviewCardAction()}
                          patDeviceString={appStrings.buttonBmdReviewCardActionPatDevice()}
                        />
                      }
                    >
                      <Icons.Edit /> {appStrings.buttonChange()}
                    </WithAltAudio>
                  </Caption>
                </Button>
              )
            }
          >
            {contest.type === 'candidate' && (
              <CandidateContestResult
                contest={contest}
                election={election}
                selectionsAreEditable={selectionsAreEditable}
                precinctId={precinctId}
                vote={votes[contest.id] as CandidateVote}
                votes={votes}
                ballotStyle={ballotStyle}
              />
            )}
            {contest.type === 'yesno' && (
              <YesNoContestResult
                vote={votes[contest.id] as YesNoVote}
                contest={contest}
                election={election}
                selectionsAreEditable={selectionsAreEditable}
              />
            )}
            {contest.type === 'ms-either-neither' && (
              <MsEitherNeitherContestResult
                contest={contest}
                election={election}
                eitherNeitherContestVote={
                  votes[contest.eitherNeitherContestId] as OptionalYesNoVote
                }
                selectionsAreEditable={selectionsAreEditable}
                pickOneContestVote={
                  votes[contest.pickOneContestId] as OptionalYesNoVote
                }
              />
            )}
            {contest.type === 'straight-party' && (
              <StraightPartyContestResult
                contest={contest}
                election={election}
                vote={votes[contest.id] as StraightPartyVote | undefined}
                selectionsAreEditable={selectionsAreEditable}
              />
            )}
          </Card>
        </Contest>
      ))}
    </React.Fragment>
  );
}
