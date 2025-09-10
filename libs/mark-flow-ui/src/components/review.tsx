import React from 'react';
import styled from 'styled-components';
import getDeepValue from 'lodash.get';
import {
  CandidateVote,
  YesNoVote,
  OptionalYesNoVote,
  Election,
  VotesDict,
  PrecinctId,
  getContestDistrict,
  ContestId,
  Candidate,
  ElectionStringKey,
} from '@votingworks/types';
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
  UiStringsReactQueryApi,
  TextOnly,
} from '@votingworks/ui';

import { getSingleYesNoVote } from '@votingworks/utils';
import {
  CandidateContestResultInterface,
  MsEitherNeitherContestResultInterface,
  YesNoContestResultInterface,
} from '../config/types';

import { ContestsWithMsEitherNeither } from '../utils/ms_either_neither_contests';
import { WriteInCandidateName } from './write_in_candidate_name';

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
  election,
  selectionsAreEditable,
  uiStringsApi,
}: CandidateContestResultInterface): JSX.Element {
  const district = getContestDistrict(election, contest);
  const remainingChoices = contest.seats - vote.length;

  const audioIdsQuery = uiStringsApi.getAudioIds.useQuery('en');

  const hasContestAudioOverride = !!getDeepValue(
    audioIdsQuery.data,
    `${ElectionStringKey.LA_CONTEST_AUDIO}.${contest.id}`
  );

  function hasCandidateAudioOverride(candidate: Candidate) {
    return !!getDeepValue(
      audioIdsQuery.data,
      `${ElectionStringKey.LA_CANDIDATE_AUDIO}.${candidate.id}`
    );
  }

  const noVotesString = selectionsAreEditable
    ? appStrings.warningNoVotesForContest()
    : appStrings.noteBallotContestNoSelection();

  return (
    <VoterContestSummary
      districtName={
        hasContestAudioOverride ? (
          <TextOnly>{electionStrings.districtName(district)}</TextOnly>
        ) : (
          electionStrings.districtName(district)
        )
      }
      title={
        hasContestAudioOverride ? (
          <WithAltAudio audioText={electionStrings.laContestAudio(contest)}>
            {electionStrings.contestTitle(contest)}
          </WithAltAudio>
        ) : (
          electionStrings.contestTitle(contest)
        )
      }
      titleType="h2"
      undervoteWarning={
        remainingChoices > 0 ? (
          vote.length === 0 ? (
            noVotesString
          ) : (
            <React.Fragment>
              {appStrings.labelNumVotesUnused()}{' '}
              <NumberString value={remainingChoices} />
            </React.Fragment>
          )
        ) : undefined
      }
      votes={vote.map((candidate): ContestVote => {
        const hasAudioOverride = hasCandidateAudioOverride(candidate);

        return {
          caption: candidate.isWriteIn ? (
            appStrings.labelWriteInParenthesized()
          ) : hasAudioOverride ? (
            <TextOnly>
              <CandidatePartyList
                candidate={candidate}
                electionParties={election.parties}
              />
            </TextOnly>
          ) : (
            <CandidatePartyList
              candidate={candidate}
              electionParties={election.parties}
            />
          ),
          id: candidate.id,
          label: candidate.isWriteIn ? (
            <Font breakWord>
              <AudioOnly>
                <WriteInCandidateName name={candidate.name} />
              </AudioOnly>
              {candidate.name}
            </Font>
          ) : hasAudioOverride ? (
            <WithAltAudio
              audioText={electionStrings.laCandidateAudio(candidate)}
            >
              {electionStrings.candidateName(candidate)}
            </WithAltAudio>
          ) : (
            electionStrings.candidateName(candidate)
          ),
        };
      })}
    />
  );
}

function YesNoContestResult({
  vote,
  contest,
  election,
  selectionsAreEditable,
  uiStringsApi,
}: YesNoContestResultInterface): JSX.Element {
  const district = getContestDistrict(election, contest);
  const yesNo = getSingleYesNoVote(vote);
  const selectedOption =
    yesNo === contest.yesOption.id
      ? contest.yesOption
      : yesNo === contest.noOption.id
      ? contest.noOption
      : null;

  const audioIdsQuery = uiStringsApi.getAudioIds.useQuery('en');
  const hasContestAudioOverride = !!getDeepValue(
    audioIdsQuery.data,
    `${ElectionStringKey.LA_CONTEST_AUDIO}.${contest.id}`
  );

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
      title={
        hasContestAudioOverride ? (
          <WithAltAudio audioText={electionStrings.laContestAudio(contest)}>
            {electionStrings.contestTitle(contest)}
          </WithAltAudio>
        ) : (
          electionStrings.contestTitle(contest)
        )
      }
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

export interface ReviewProps {
  election: Election;
  precinctId: PrecinctId;
  contests: ContestsWithMsEitherNeither;
  votes: VotesDict;
  returnToContest?: (contestId: string) => void;
  selectionsAreEditable?: boolean;
  uiStringsApi: UiStringsReactQueryApi;
}

export function Review({
  election,
  precinctId,
  contests,
  votes,
  returnToContest,
  selectionsAreEditable = true,
  uiStringsApi,
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
                uiStringsApi={uiStringsApi}
                vote={votes[contest.id] as CandidateVote}
              />
            )}
            {contest.type === 'yesno' && (
              <YesNoContestResult
                vote={votes[contest.id] as YesNoVote}
                contest={contest}
                election={election}
                selectionsAreEditable={selectionsAreEditable}
                uiStringsApi={uiStringsApi}
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
          </Card>
        </Contest>
      ))}
    </React.Fragment>
  );
}
