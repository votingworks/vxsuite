import React from 'react';
import styled from 'styled-components';
import {
  BallotStyle,
  BallotStyleId,
  CandidateContest,
  CandidateVote,
  Contest,
  ContestId,
  Election,
  ElectionDefinition,
  StraightPartyVote,
  VotesDict,
  YesNoVote,
  getBallotStyle,
  getCandidateVoteSortedForBallotStyleRotation,
  getContestDistrict,
} from '@votingworks/types';
import {
  Button,
  CandidatePartyList,
  Card,
  ContestVote,
  List,
  NumberString,
  PageNavigationButtonId,
  VoterContestSummary,
  WithScrollButtons,
  appStrings,
  electionStrings,
} from '@votingworks/ui';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';

import { Screen } from '../components/layout';
import { returnBallot } from '../api';

const OuterContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

function candidateContestVotes(
  election: Election,
  contest: CandidateContest,
  ballotStyle: BallotStyle,
  vote: CandidateVote
): ContestVote[] {
  // Show selections in the same order they appeared on the voter's ballot,
  // accounting for ballot rotation.
  const orderedVote = getCandidateVoteSortedForBallotStyleRotation({
    inputVote: vote,
    contest,
    ballotStyle,
  });
  return orderedVote.map((candidate) => ({
    id: candidate.id,
    label: candidate.isWriteIn
      ? candidate.name
      : electionStrings.candidateName(candidate),
    caption: candidate.isWriteIn ? (
      appStrings.labelWriteInParenthesized()
    ) : (
      <CandidatePartyList
        candidate={candidate}
        electionParties={election.parties}
      />
    ),
    partyIds: candidate.partyIds,
  }));
}

function ContestResult({
  election,
  ballotStyle,
  contest,
  votes,
  isOvervoted,
}: {
  election: Election;
  ballotStyle: BallotStyle;
  contest: Contest;
  votes: VotesDict;
  isOvervoted: boolean;
}): JSX.Element {
  const district = getContestDistrict(election, contest);
  const commonProps = {
    districtName: electionStrings.districtName(district),
    title: electionStrings.contestTitle(contest),
    titleType: 'h2',
    overvoteWarning: isOvervoted
      ? appStrings.noteScannerOvervoteContestsCardSingular()
      : undefined,
  } as const;

  const noSelectionWarning = appStrings.noteBallotContestNoSelection();

  switch (contest.type) {
    case 'candidate': {
      const vote = (votes[contest.id] ?? []) as CandidateVote;
      const numUnusedVotes = contest.seats - vote.length;
      return (
        <VoterContestSummary
          {...commonProps}
          votes={candidateContestVotes(election, contest, ballotStyle, vote)}
          undervoteWarning={
            numUnusedVotes > 0 &&
            (vote.length === 0 ? (
              noSelectionWarning
            ) : (
              <React.Fragment>
                {appStrings.labelNumVotesUnused()}{' '}
                <NumberString value={numUnusedVotes} />
              </React.Fragment>
            ))
          }
        />
      );
    }
    case 'yesno': {
      const vote = (votes[contest.id] ?? []) as YesNoVote;
      const selectedOptions = contest.options.filter((option) =>
        vote.includes(option.id)
      );
      return (
        <VoterContestSummary
          {...commonProps}
          votes={selectedOptions.map((option) => ({
            id: option.id,
            label: electionStrings.contestOptionLabel(option),
          }))}
          undervoteWarning={vote.length === 0 && noSelectionWarning}
        />
      );
    }
    case 'straight-party': {
      const vote = (votes[contest.id] ?? []) as StraightPartyVote;
      const party = election.parties.find((p) => p.id === vote[0]);
      return (
        <VoterContestSummary
          {...commonProps}
          votes={
            party
              ? [{ id: party.id, label: electionStrings.partyFullName(party) }]
              : []
          }
          undervoteWarning={!party ? noSelectionWarning : undefined}
        />
      );
    }
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(contest);
  }
}

function isContestOvervoted(
  contest: Contest,
  votes: VotesDict,
  overvoteContestIds: ReadonlySet<ContestId>
): boolean {
  if (overvoteContestIds.has(contest.id)) {
    return true;
  }
  const vote = votes[contest.id] ?? [];
  switch (contest.type) {
    case 'candidate':
      return vote.length > contest.seats;
    case 'yesno':
    case 'straight-party':
      return vote.length > 1;
    /* istanbul ignore next - compile time check for completeness */
    default:
      return throwIllegalValue(contest);
  }
}

export interface BallotReviewScreenProps {
  electionDefinition: ElectionDefinition;
  ballotStyleId: BallotStyleId;
  votes: VotesDict;
  isTestMode: boolean;
  hasCastBallot: boolean;
  onCastBallot: () => void;
  overvoteContestIds?: ReadonlySet<ContestId>;
  /**
   * Whether returning the ballot, rather than casting it, is the primary
   * action. Should match the primary action on the screen the voter came from,
   * so that the emphasized action doesn't change as they review their votes.
   */
  returnBallotIsPrimary?: boolean;
}

/**
 * Displays the voter's interpreted selections for a scanned ballot held in the
 * scanner, including over/undervote and blank-contest warnings, and lets them
 * either cast the ballot or return it.
 */
export function BallotReviewScreen({
  electionDefinition,
  ballotStyleId,
  votes,
  isTestMode,
  hasCastBallot,
  onCastBallot,
  overvoteContestIds = new Set(),
  returnBallotIsPrimary = false,
}: BallotReviewScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();

  const { election } = electionDefinition;
  const ballotStyle = assertDefined(
    getBallotStyle({ ballotStyleId, election })
  );
  const contests = election.contests.filter((contest) => contest.id in votes);

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant={returnBallotIsPrimary ? 'primary' : undefined}
            onPress={() => returnBallotMutation.mutate()}
            disabled={hasCastBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            variant={returnBallotIsPrimary ? undefined : 'primary'}
            onPress={onCastBallot}
            disabled={hasCastBallot}
          >
            {appStrings.buttonCastBallot()}
          </Button>
        </React.Fragment>
      }
      padded
      title={appStrings.titleBmdReviewScreen()}
      voterFacing
      showTestModeBanner={isTestMode}
    >
      <OuterContainer>
        <WithScrollButtons>
          <List maxColumns={2}>
            {contests.map((contest) => (
              <Card key={contest.id}>
                <ContestResult
                  election={election}
                  ballotStyle={ballotStyle}
                  contest={contest}
                  votes={votes}
                  isOvervoted={isContestOvervoted(
                    contest,
                    votes,
                    overvoteContestIds
                  )}
                />
              </Card>
            ))}
          </List>
        </WithScrollButtons>
      </OuterContainer>
    </Screen>
  );
}
