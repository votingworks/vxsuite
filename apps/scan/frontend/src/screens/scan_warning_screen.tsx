import React, { useState } from 'react';
import {
  AdjudicationReason,
  CandidateContest,
  ElectionDefinition,
  AdjudicationReasonInfo,
  OvervoteAdjudicationReasonInfo,
  UndervoteAdjudicationReasonInfo,
  AnyContest,
} from '@votingworks/types';
import {
  Button,
  Caption,
  CenteredLargeProse,
  fontSizeTheme,
  FullScreenIconWrapper,
  H1,
  Icons,
  Modal,
  ModalWidth,
  P,
  Prose,
} from '@votingworks/ui';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { assert, find, integers } from '@votingworks/basics';
import pluralize from 'pluralize';
import styled from 'styled-components';

import { ScreenMainCenterChild } from '../components/layout';

import { toSentence } from '../utils/to_sentence';
import { acceptBallot, returnBallot } from '../api';
import { usePreviewContext } from '../preview_dashboard';

const ResponsiveButtonParagraph = styled.p`
  @media (orientation: portrait) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5em;
    & > button {
      flex: 1 auto;
      padding-right: 0.25em;
      padding-left: 0.25em;
    }
  }
`;

interface ConfirmModalProps {
  content?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ content, onConfirm, onCancel }: ConfirmModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Modal
      themeDeprecated={fontSizeTheme.large}
      modalWidth={ModalWidth.Wide}
      title="Are you sure?"
      centerContent
      content={content}
      actions={
        <React.Fragment>
          <Button
            variant="primary"
            onPress={() => {
              setConfirmed(true);
              onConfirm();
            }}
            disabled={confirmed}
          >
            Yes, Cast Ballot As Is
          </Button>
          <Button onPress={onCancel} disabled={confirmed}>
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onCancel}
    />
  );
}

interface OvervoteWarningScreenProps {
  electionDefinition: ElectionDefinition;
  overvotes: readonly OvervoteAdjudicationReasonInfo[];
}

function OvervoteWarningScreen({
  electionDefinition,
  overvotes,
}: OvervoteWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const allowCastingOvervotes = !isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.DISALLOW_CASTING_OVERVOTES
  );
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  const contestNames = overvotes
    .map((overvote) =>
      find(
        electionDefinition.election.contests,
        (contest) => contest.id === overvote.contestId
      )
    )
    .reduce<AnyContest[]>(
      (acc, c) => (acc.find((o) => o.id === c.id) ? acc : [...acc, c]),
      []
    )
    .map((c) => c.title);

  return (
    <ScreenMainCenterChild>
      <FullScreenIconWrapper color="warning">
        <Icons.Warning />
      </FullScreenIconWrapper>
      <CenteredLargeProse>
        <H1>Too Many Votes</H1>
        <P>
          There are too many votes marked in the{' '}
          {pluralize('contest', contestNames.length)}:{' '}
          {toSentence(contestNames)}.
        </P>
        <ResponsiveButtonParagraph>
          <Button
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
          >
            Return Ballot
          </Button>
          {allowCastingOvervotes && (
            <React.Fragment>
              {' '}
              or{' '}
              <Button onPress={() => setConfirmTabulate(true)}>
                Cast Ballot As Is
              </Button>
            </React.Fragment>
          )}
        </ResponsiveButtonParagraph>
        <Caption>Ask a poll worker if you need help.</Caption>
      </CenteredLargeProse>
      {confirmTabulate && (
        <ConfirmModal
          content={
            <Prose textCenter>
              <P>
                Your votes in {pluralize('contest', contestNames.length, true)}{' '}
                will not be counted.
              </P>
            </Prose>
          }
          onConfirm={() => acceptBallotMutation.mutate()}
          onCancel={() => setConfirmTabulate(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

interface UndervoteWarningScreenProps {
  electionDefinition: ElectionDefinition;
  undervotes: readonly UndervoteAdjudicationReasonInfo[];
}

function UndervoteWarningScreen({
  electionDefinition,
  undervotes,
}: UndervoteWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [confirmTabulate, setConfirmTabulate] = useState(false);

  const { contests } = electionDefinition.election;
  const blankContestNames = undervotes
    .filter((undervote) => undervote.optionIds.length === 0)
    .map(
      (undervote) =>
        find(contests, (contest) => contest.id === undervote.contestId).title
    );
  const partiallyVotedContestNames = undervotes
    .filter((undervote) => undervote.optionIds.length > 0)
    .map(
      (undervote) =>
        find(contests, (contest) => contest.id === undervote.contestId).title
    );

  function truncateContestNames(names: string[], min = 3, max = 5) {
    const displayLength = names.length > max ? min : names.length;
    const remainderLength = names.length - displayLength;
    const displayNames = names.slice(0, displayLength);
    if (remainderLength) {
      displayNames.push(
        `${remainderLength} more ${pluralize('contest', remainderLength)}`
      );
    }
    return displayNames;
  }

  return (
    <ScreenMainCenterChild>
      <FullScreenIconWrapper color="warning">
        <Icons.Warning />
      </FullScreenIconWrapper>
      <CenteredLargeProse>
        <H1>Review Your Ballot</H1>
        {blankContestNames.length > 0 && (
          <P>
            No votes detected in{' '}
            {pluralize('contest', blankContestNames.length)}:{' '}
            {toSentence(truncateContestNames(blankContestNames))}.
          </P>
        )}
        {partiallyVotedContestNames.length > 0 && (
          <P>
            You may vote for more candidates in the{' '}
            {pluralize('contest', partiallyVotedContestNames.length)}:{' '}
            {toSentence(truncateContestNames(partiallyVotedContestNames))}.
          </P>
        )}
        <ResponsiveButtonParagraph>
          <Button
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
          >
            Return Ballot
          </Button>{' '}
          or{' '}
          <Button onPress={() => setConfirmTabulate(true)}>
            Cast Ballot As Is
          </Button>
        </ResponsiveButtonParagraph>
        <Caption>
          Your votes will count, even if you leave some blank.
          <br />
          Ask a poll worker if you need help.
        </Caption>
      </CenteredLargeProse>
      {confirmTabulate && (
        <ConfirmModal
          content={
            <Prose textCenter>
              <P>
                {blankContestNames.length > 0 && (
                  <span>
                    You did not vote in{' '}
                    {pluralize('contest', blankContestNames.length, true)}.
                    <br />
                  </span>
                )}
                {partiallyVotedContestNames.length > 0 && (
                  <span>
                    You can still vote for more candidates in{' '}
                    {pluralize(
                      'contest',
                      partiallyVotedContestNames.length,
                      true
                    )}
                    .
                  </span>
                )}
              </P>
              <Caption>
                Your votes will count, even if you leave some blank.
              </Caption>
            </Prose>
          }
          onConfirm={() => acceptBallotMutation.mutate()}
          onCancel={() => setConfirmTabulate(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

function BlankBallotWarningScreen(): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  return (
    <ScreenMainCenterChild>
      <FullScreenIconWrapper color="warning">
        <Icons.Warning />
      </FullScreenIconWrapper>
      <CenteredLargeProse>
        <H1>Review Your Ballot</H1>
        <P>No votes were found when scanning this ballot.</P>
        <ResponsiveButtonParagraph>
          <Button
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
          >
            Return Ballot
          </Button>{' '}
          or{' '}
          <Button onPress={() => setConfirmTabulate(true)}>
            Cast Ballot As Is
          </Button>
        </ResponsiveButtonParagraph>
        <Caption>
          Your votes will count, even if you leave some blank.
          <br />
          Ask a poll worker if you need help.
        </Caption>
      </CenteredLargeProse>
      {confirmTabulate && (
        <ConfirmModal
          content={
            <Prose textCenter>
              <P>No votes will be counted from this ballot.</P>
            </Prose>
          }
          onConfirm={() => acceptBallotMutation.mutate()}
          onCancel={() => setConfirmTabulate(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

function OtherReasonWarningScreen(): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  return (
    <ScreenMainCenterChild>
      <FullScreenIconWrapper color="warning">
        <Icons.Warning />
      </FullScreenIconWrapper>
      <CenteredLargeProse>
        <H1>Scanning Failed</H1>
        <P>There was a problem scanning this ballot.</P>
        <ResponsiveButtonParagraph>
          <Button
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
          >
            Return Ballot
          </Button>{' '}
          or{' '}
          <Button onPress={() => setConfirmTabulate(true)}>
            Cast Ballot As Is
          </Button>
        </ResponsiveButtonParagraph>
        <Caption>Ask a poll worker if you need help.</Caption>
      </CenteredLargeProse>
      {confirmTabulate && (
        <ConfirmModal
          content={
            <Prose textCenter>
              <H1>Are you sure?</H1>
              <P>No votes will be recorded for this ballot.</P>
            </Prose>
          }
          onConfirm={() => acceptBallotMutation.mutate()}
          onCancel={() => setConfirmTabulate(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

export interface Props {
  electionDefinition: ElectionDefinition;
  adjudicationReasonInfo: readonly AdjudicationReasonInfo[];
}

export function ScanWarningScreen({
  electionDefinition,
  adjudicationReasonInfo,
}: Props): JSX.Element {
  let isBlank = false;
  const overvoteReasons: OvervoteAdjudicationReasonInfo[] = [];
  const undervoteReasons: UndervoteAdjudicationReasonInfo[] = [];

  for (const reason of adjudicationReasonInfo) {
    if (reason.type === AdjudicationReason.BlankBallot) {
      isBlank = true;
    } else if (reason.type === AdjudicationReason.Overvote) {
      overvoteReasons.push(reason);
    } else if (reason.type === AdjudicationReason.Undervote) {
      undervoteReasons.push(reason);
    }
  }

  if (isBlank) {
    return <BlankBallotWarningScreen />;
  }

  if (overvoteReasons.length > 0) {
    return (
      <OvervoteWarningScreen
        electionDefinition={electionDefinition}
        overvotes={overvoteReasons}
      />
    );
  }

  if (undervoteReasons.length > 0) {
    return (
      <UndervoteWarningScreen
        electionDefinition={electionDefinition}
        undervotes={undervoteReasons}
      />
    );
  }

  return <OtherReasonWarningScreen />;
}

/* istanbul ignore next */
export function OvervotePreview(): JSX.Element {
  const { electionDefinition } = usePreviewContext();

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.seats === 1 && c.candidates.length > 1
  );
  assert(contest);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      adjudicationReasonInfo={[
        {
          type: AdjudicationReason.Overvote,
          contestId: contest.id,
          optionIds: contest.candidates.slice(0, 2).map(({ id }) => id),
          optionIndexes: [0, 1],
          expected: contest.seats,
        },
        {
          type: AdjudicationReason.Overvote,
          contestId: contest.id,
          optionIds: contest.candidates.slice(0, 2).map(({ id }) => id),
          optionIndexes: [0, 1],
          expected: contest.seats,
        },
      ]}
    />
  );
}

/* istanbul ignore next */
export function UndervoteNoVotes1ContestPreview(): JSX.Element {
  const { electionDefinition } = usePreviewContext();

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contest);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      adjudicationReasonInfo={[
        {
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          optionIds: [],
          optionIndexes: [],
          expected: contest.seats,
        },
      ]}
    />
  );
}

/* istanbul ignore next */
export function UndervoteNoVotesManyContestsPreview(): JSX.Element {
  const { electionDefinition } = usePreviewContext();

  const contests = electionDefinition.election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contests.length > 0);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      adjudicationReasonInfo={contests.map((contest) => ({
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        optionIds: [],
        optionIndexes: [],
        expected: contest.seats,
      }))}
    />
  );
}

/* istanbul ignore next */
export function Undervote1ContestPreview(): JSX.Element {
  const { electionDefinition } = usePreviewContext();

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  );
  assert(contest);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      adjudicationReasonInfo={[
        {
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          optionIds: contest.candidates
            .slice(0, contest.seats - 1)
            .map(({ id }) => id),
          optionIndexes: integers().take(contest.seats).toArray(),
          expected: contest.seats,
        },
      ]}
    />
  );
}

/* istanbul ignore next */
export function UndervoteManyContestsPreview(): JSX.Element {
  const { electionDefinition } = usePreviewContext();

  const contests = electionDefinition.election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contests.length > 0);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      adjudicationReasonInfo={contests.map((contest) => ({
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        optionIds: contest.candidates.slice(0, 1).map(({ id }) => id),
        optionIndexes: [0, 1],
        expected: contest.seats,
      }))}
    />
  );
}

/* istanbul ignore next */
export function BlankBallotPreview(): JSX.Element {
  const { electionDefinition } = usePreviewContext();

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      adjudicationReasonInfo={[{ type: AdjudicationReason.BlankBallot }]}
    />
  );
}
