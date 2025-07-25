import React, { useState } from 'react';
import {
  AdjudicationReason,
  CandidateContest,
  ElectionDefinition,
  AdjudicationReasonInfo,
  OvervoteAdjudicationReasonInfo,
  UndervoteAdjudicationReasonInfo,
  AnyContest,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import {
  Button,
  Caption,
  FullScreenIconWrapper,
  Icons,
  Modal,
  ModalWidth,
  P,
  PageNavigationButtonId,
  WithScrollButtons,
  appStrings,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';

import { Screen } from '../components/layout';

import { acceptBallot, getConfig, returnBallot } from '../api';
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
      title={appStrings.titleModalConfirmYourVotes()}
      content={content}
      actions={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            variant="primary"
            icon="Done"
            onPress={() => {
              setConfirmed(true);
              onConfirm();
            }}
            disabled={confirmed}
          >
            {appStrings.buttonCastBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            onPress={onCancel}
            disabled={confirmed}
          >
            {appStrings.buttonCancel()}
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onCancel}
    />
  );
}

interface MisvoteWarningScreenProps {
  electionDefinition: ElectionDefinition;
  systemSettings: SystemSettings;
  overvotes: readonly OvervoteAdjudicationReasonInfo[];
  undervotes: readonly UndervoteAdjudicationReasonInfo[];
  isTestMode: boolean;
}

function MisvoteWarningScreen({
  electionDefinition,
  systemSettings,
  overvotes,
  undervotes,
  isTestMode,
}: MisvoteWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const allowCastingOvervotes = !systemSettings.disallowCastingOvervotes;
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
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
          >
            {appStrings.buttonReturnBallot()}
          </Button>

          {(allowCastingOvervotes || overvoteContests.length === 0) && (
            <Button
              id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
              onPress={() => setConfirmTabulate(true)}
            >
              {appStrings.buttonCastBallot()}
            </Button>
          )}
        </React.Fragment>
      }
      padded
      title={
        <React.Fragment>
          <Icons.Warning color="warning" />{' '}
          {appStrings.titleScannerBallotWarningsScreen()}
        </React.Fragment>
      }
      voterFacing
      showTestModeBanner={isTestMode}
    >
      <MisvoteWarnings
        blankContests={blankContests}
        overvoteContests={overvoteContests}
        partiallyVotedContests={partiallyVotedContests}
      />
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

interface BlankBallotWarningScreenProps {
  isTestMode: boolean;
}

function BlankBallotWarningScreen({
  isTestMode,
}: BlankBallotWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={() => setConfirmTabulate(true)}
          >
            {appStrings.buttonCastBallot()}
          </Button>
        </React.Fragment>
      }
      centerContent
      padded
      voterFacing
      showTestModeBanner={isTestMode}
    >
      <FullScreenPromptLayout
        title={appStrings.titleScannerBallotWarningsScreen()}
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.warningScannerNoVotesFound()}</P>
        <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
      </FullScreenPromptLayout>
      {confirmTabulate && (
        <ConfirmModal
          content={<P>{appStrings.warningScannerBlankBallotSubmission()}</P>}
          onConfirm={() => acceptBallotMutation.mutate()}
          onCancel={() => setConfirmTabulate(false)}
        />
      )}
    </Screen>
  );
}

interface OtherReasonWarningScreenProps {
  isTestMode: boolean;
}

function OtherReasonWarningScreen({
  isTestMode,
}: OtherReasonWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={() => setConfirmTabulate(true)}
          >
            {appStrings.buttonCastBallot()}
          </Button>
        </React.Fragment>
      }
      centerContent
      padded
      voterFacing
      showTestModeBanner={isTestMode}
    >
      <FullScreenPromptLayout
        title={appStrings.titleScanningFailed()}
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.warningProblemScanningBallot()}</P>
        <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
      </FullScreenPromptLayout>
      {confirmTabulate && (
        <ConfirmModal
          content={<P>{appStrings.warningScannerBlankBallotSubmission()}</P>}
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
  systemSettings: SystemSettings;
  isTestMode: boolean;
}

export function ScanWarningScreen({
  electionDefinition,
  adjudicationReasonInfo,
  systemSettings,
  isTestMode,
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
    return <BlankBallotWarningScreen isTestMode={isTestMode} />;
  }

  if (undervoteReasons.length > 0 || overvoteReasons.length > 0) {
    return (
      <MisvoteWarningScreen
        electionDefinition={electionDefinition}
        systemSettings={systemSettings}
        undervotes={undervoteReasons}
        overvotes={overvoteReasons}
        isTestMode={isTestMode}
      />
    );
  }

  return <OtherReasonWarningScreen isTestMode={isTestMode} />;
}

/* istanbul ignore next - @preserve */
export function OvervotePreview(): JSX.Element {
  const configQuery = getConfig.useQuery();

  const electionDefinition = configQuery.data?.electionDefinition;
  if (!electionDefinition) {
    return <P>Loading…</P>;
  }

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
          expected: contest.seats,
        },
        {
          type: AdjudicationReason.Overvote,
          contestId: contest.id,
          optionIds: contest.candidates.slice(0, 2).map(({ id }) => id),
          expected: contest.seats,
        },
      ]}
      systemSettings={DEFAULT_SYSTEM_SETTINGS}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next - @preserve */
export function UndervoteNoVotes1ContestPreview(): JSX.Element {
  const configQuery = getConfig.useQuery();
  const electionDefinition = configQuery.data?.electionDefinition;

  if (!electionDefinition) {
    return <P>Loading…</P>;
  }

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contest);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      systemSettings={DEFAULT_SYSTEM_SETTINGS}
      adjudicationReasonInfo={[
        {
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          optionIds: [],
          expected: contest.seats,
        },
      ]}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next - @preserve */
export function UndervoteNoVotesManyContestsPreview(): JSX.Element {
  const configQuery = getConfig.useQuery();
  const electionDefinition = configQuery.data?.electionDefinition;

  if (!electionDefinition) {
    return <P>Loading…</P>;
  }

  const contests = electionDefinition.election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contests.length > 0);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      systemSettings={DEFAULT_SYSTEM_SETTINGS}
      adjudicationReasonInfo={contests.map((contest) => ({
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        optionIds: [],
        expected: contest.seats,
      }))}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next - @preserve */
export function Undervote1ContestPreview(): JSX.Element {
  const configQuery = getConfig.useQuery();
  const electionDefinition = configQuery.data?.electionDefinition;

  if (!electionDefinition) {
    return <P>Loading…</P>;
  }

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  );
  assert(contest);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      systemSettings={DEFAULT_SYSTEM_SETTINGS}
      adjudicationReasonInfo={[
        {
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          optionIds: contest.candidates
            .slice(0, contest.seats - 1)
            .map(({ id }) => id),
          expected: contest.seats,
        },
      ]}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next - @preserve */
export function MixedOvervotesAndUndervotesPreview(): JSX.Element {
  const configQuery = getConfig.useQuery();
  const electionDefinition = configQuery.data?.electionDefinition;

  if (!electionDefinition) {
    return <P>Loading…</P>;
  }

  const contests = electionDefinition.election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contests.length > 0);

  const multiSeatContests = contests.filter((c) => c.seats > 1);

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      systemSettings={DEFAULT_SYSTEM_SETTINGS}
      adjudicationReasonInfo={[
        ...multiSeatContests.map<AdjudicationReasonInfo>((c) => ({
          type: AdjudicationReason.Undervote,
          contestId: c.id,
          optionIds: c.candidates.slice(0, c.seats - 1).map(({ id }) => id),
          expected: c.seats,
        })),
        ...contests.slice(0, 3).map<AdjudicationReasonInfo>((c) => ({
          type: AdjudicationReason.Undervote,
          contestId: c.id,
          optionIds: [],
          expected: c.seats,
        })),
        ...contests.slice(3, 5).map<AdjudicationReasonInfo>((c) => ({
          type: AdjudicationReason.Overvote,
          contestId: c.id,
          optionIds: c.candidates.slice(0, 2).map(({ id }) => id),
          expected: c.seats,
        })),
      ]}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next - @preserve */
export function BlankBallotPreview(): JSX.Element {
  const configQuery = getConfig.useQuery();
  const electionDefinition = configQuery.data?.electionDefinition;

  if (!electionDefinition) {
    return <P>Loading…</P>;
  }

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      systemSettings={DEFAULT_SYSTEM_SETTINGS}
      adjudicationReasonInfo={[{ type: AdjudicationReason.BlankBallot }]}
      isTestMode={false}
    />
  );
}
