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
  FullScreenIconWrapper,
  Icons,
  Modal,
  ModalWidth,
  P,
  WithScrollButtons,
} from '@votingworks/ui';
import { assert, integers } from '@votingworks/basics';

import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Screen } from '../components/layout';

import { acceptBallot, returnBallot } from '../api';
import { usePreviewContext } from '../preview_dashboard';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import {
  MisvoteWarnings,
  WarningDetails as MisvoteWarningDetails,
} from '../components/misvote_warnings';

interface ConfirmModalProps {
  content?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ content, onConfirm, onCancel }: ConfirmModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Modal
      modalWidth={ModalWidth.Wide}
      title="Are you sure?"
      content={content}
      actions={
        <React.Fragment>
          <Button
            variant="primary"
            icon="Done"
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

interface MisvoteWarningScreenProps {
  electionDefinition: ElectionDefinition;
  overvotes: readonly OvervoteAdjudicationReasonInfo[];
  undervotes: readonly UndervoteAdjudicationReasonInfo[];
}

function MisvoteWarningScreen({
  electionDefinition,
  overvotes,
  undervotes,
}: MisvoteWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const allowCastingOvervotes = !isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.DISALLOW_CASTING_OVERVOTES
  );
  const [confirmTabulate, setConfirmTabulate] = useState(false);

  const { contests } = electionDefinition.election;

  // Group contest IDs for each warning type first and remove any potential
  // duplicates:
  const blankContestIds = new Set<string>();
  const partiallyVotedContestIds = new Set<string>();
  const overvoteContestIds = new Set<string>();

  for (const undervote of undervotes) {
    if (undervote.optionIds.length === 0) {
      blankContestIds.add(undervote.contestId);
    } else {
      partiallyVotedContestIds.add(undervote.contestId);
    }
  }

  for (const overvote of overvotes) {
    overvoteContestIds.add(overvote.contestId);
  }

  // The, map IDs to contests in the election:
  const blankContests: AnyContest[] = [];
  const partiallyVotedContests: AnyContest[] = [];
  const overvoteContests: AnyContest[] = [];

  for (const contest of contests) {
    if (blankContestIds.has(contest.id)) {
      blankContests.push(contest);
      continue;
    }

    if (partiallyVotedContestIds.has(contest.id)) {
      partiallyVotedContests.push(contest);
      continue;
    }

    if (overvoteContestIds.has(contest.id)) {
      overvoteContests.push(contest);
      continue;
    }
  }

  return (
    <Screen centerContent>
      <FullScreenPromptLayout
        title={
          <React.Fragment>
            <Icons.Warning color="warning" /> Review Your Ballot
          </React.Fragment>
        }
        actionButtons={
          <React.Fragment>
            <Button
              variant="primary"
              onPress={() => returnBallotMutation.mutate()}
            >
              Return Ballot
            </Button>

            {(allowCastingOvervotes || overvoteContests.length === 0) && (
              <Button onPress={() => setConfirmTabulate(true)}>
                Cast Ballot As Is
              </Button>
            )}
          </React.Fragment>
        }
      >
        <MisvoteWarnings
          blankContests={blankContests}
          overvoteContests={overvoteContests}
          partiallyVotedContests={partiallyVotedContests}
        />
      </FullScreenPromptLayout>
      {confirmTabulate && (
        <ConfirmModal
          content={
            <WithScrollButtons>
              <MisvoteWarningDetails
                blankContests={blankContests}
                overvoteContests={overvoteContests}
                partiallyVotedContests={partiallyVotedContests}
              />
            </WithScrollButtons>
          }
          onConfirm={() => acceptBallotMutation.mutate()}
          onCancel={() => setConfirmTabulate(false)}
        />
      )}
    </Screen>
  );
}

function BlankBallotWarningScreen(): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  return (
    <Screen centerContent>
      <FullScreenPromptLayout
        title="Review Your Ballot"
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
        actionButtons={
          <React.Fragment>
            <Button
              variant="primary"
              onPress={() => returnBallotMutation.mutate()}
            >
              Return Ballot
            </Button>
            <Button onPress={() => setConfirmTabulate(true)}>
              Cast Ballot As Is
            </Button>
          </React.Fragment>
        }
      >
        <P>No votes were found when scanning this ballot.</P>
        <Caption>
          Your votes will count, even if you leave some blank.
          <br />
          Ask a poll worker if you need help.
        </Caption>
      </FullScreenPromptLayout>
      {confirmTabulate && (
        <ConfirmModal
          content={<P>No votes will be counted from this ballot.</P>}
          onConfirm={() => acceptBallotMutation.mutate()}
          onCancel={() => setConfirmTabulate(false)}
        />
      )}
    </Screen>
  );
}

function OtherReasonWarningScreen(): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  return (
    <Screen centerContent>
      <FullScreenPromptLayout
        title="Scanning Failed"
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
        actionButtons={
          <React.Fragment>
            <Button
              variant="primary"
              onPress={() => returnBallotMutation.mutate()}
            >
              Return Ballot
            </Button>
            <Button onPress={() => setConfirmTabulate(true)}>
              Cast Ballot As Is
            </Button>
          </React.Fragment>
        }
      >
        <P>There was a problem scanning this ballot.</P>
        <Caption>Ask a poll worker if you need help.</Caption>
      </FullScreenPromptLayout>
      {confirmTabulate && (
        <ConfirmModal
          content={<P>No votes will be recorded for this ballot.</P>}
          onConfirm={() => acceptBallotMutation.mutate()}
          onCancel={() => setConfirmTabulate(false)}
        />
      )}
    </Screen>
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

  if (undervoteReasons.length > 0 || overvoteReasons.length > 0) {
    return (
      <MisvoteWarningScreen
        electionDefinition={electionDefinition}
        undervotes={undervoteReasons}
        overvotes={overvoteReasons}
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
export function MixedOvervotesAndUndervotesPreview(): JSX.Element {
  const { electionDefinition } = usePreviewContext();

  const contests = electionDefinition.election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contests.length > 0);

  const multiSeatContests = contests.filter((c) => c.seats > 1);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      adjudicationReasonInfo={[
        ...multiSeatContests.map<AdjudicationReasonInfo>((c) => ({
          type: AdjudicationReason.Undervote,
          contestId: c.id,
          optionIds: c.candidates.slice(0, c.seats - 1).map(({ id }) => id),
          optionIndexes: integers().take(c.seats).toArray(),
          expected: c.seats,
        })),
        ...contests.slice(0, 3).map<AdjudicationReasonInfo>((c) => ({
          type: AdjudicationReason.Undervote,
          contestId: c.id,
          optionIds: [],
          optionIndexes: [],
          expected: c.seats,
        })),
        ...contests.slice(3, 5).map<AdjudicationReasonInfo>((c) => ({
          type: AdjudicationReason.Overvote,
          contestId: c.id,
          optionIds: c.candidates.slice(0, 2).map(({ id }) => id),
          optionIndexes: [0, 1],
          expected: c.seats,
        })),
      ]}
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
