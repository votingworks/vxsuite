import React from 'react';
import {
  AdjudicationReason,
  type ElectionDefinition,
  type AdjudicationReasonInfo,
  type OvervoteAdjudicationReasonInfo,
  type UndervoteAdjudicationReasonInfo,
  type Contest,
  type SystemSettings,
} from '@votingworks/types';
import {
  Button,
  Caption,
  FullScreenIconWrapper,
  Icons,
  P,
  PageNavigationButtonId,
  appStrings,
} from '@votingworks/ui';

import { Screen } from '../components/layout.js';

import { acceptBallot, returnBallot } from '../api.js';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout.js';
import { MisvoteWarnings } from '../components/misvote_warnings/index.js';

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
  const [hasCastBallot, setHasCastBallot] = React.useState(false);
  const allowCastingOvervotes = !systemSettings.disallowCastingOvervotes;

  function onCastBallot() {
    setHasCastBallot(true);
    acceptBallotMutation.mutate();
  }

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

  // Then, map IDs to contests in the election:
  const blankContests: Contest[] = [];
  const partiallyVotedContests: Contest[] = [];
  const overvoteContests: Contest[] = [];

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

  // If there are overvotes, we nudge the voter toward returning the ballot.
  // Given that undervotes are often intentional, we don't discourage casting
  // the ballot in that case. Note that completely blank ballots are handled
  // by another component.
  const returnBallotButtonIsPrimary = overvoteContests.length > 0;

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant={returnBallotButtonIsPrimary ? 'primary' : undefined}
            onPress={() => returnBallotMutation.mutate()}
            disabled={hasCastBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>

          {(allowCastingOvervotes || overvoteContests.length === 0) && (
            <Button
              id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
              variant={returnBallotButtonIsPrimary ? undefined : 'primary'}
              onPress={onCastBallot}
              disabled={hasCastBallot}
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
  const [hasCastBallot, setHasCastBallot] = React.useState(false);

  function onCastBallot() {
    setHasCastBallot(true);
    acceptBallotMutation.mutate();
  }

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            // @coverage-defer
            onPress={() => returnBallotMutation.mutate()}
            disabled={hasCastBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={onCastBallot}
            disabled={hasCastBallot}
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
    </Screen>
  );
}

interface CrossoverVotingWarningScreenProps {
  isTestMode: boolean;
}

function CrossoverVotingWarningScreen({
  isTestMode,
}: CrossoverVotingWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [hasCastBallot, setHasCastBallot] = React.useState(false);

  function onCastBallot() {
    setHasCastBallot(true);
    acceptBallotMutation.mutate();
  }

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
            disabled={hasCastBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={onCastBallot}
            disabled={hasCastBallot}
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
        <P>{appStrings.warningScannerCrossoverVoting()}</P>
        <Caption>{appStrings.noteAskPollWorkerForHelp()}</Caption>
      </FullScreenPromptLayout>
    </Screen>
  );
}

interface OtherReasonWarningScreenProps {
  isTestMode: boolean;
}

// @coverage-defer
function OtherReasonWarningScreen({
  isTestMode,
}: OtherReasonWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  const [hasCastBallot, setHasCastBallot] = React.useState(false);

  function onCastBallot() {
    setHasCastBallot(true);
    acceptBallotMutation.mutate();
  }

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            onPress={() => returnBallotMutation.mutate()}
            disabled={hasCastBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={onCastBallot}
            disabled={hasCastBallot}
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
  let isCrossover = false;
  const overvoteReasons: OvervoteAdjudicationReasonInfo[] = [];
  const undervoteReasons: UndervoteAdjudicationReasonInfo[] = [];

  for (const reason of adjudicationReasonInfo) {
    // @coverage-defer
    if (reason.type === AdjudicationReason.BlankBallot) {
      isBlank = true;
    } else if (reason.type === AdjudicationReason.CrossoverVoting) {
      isCrossover = true;
    } else if (reason.type === AdjudicationReason.Overvote) {
      overvoteReasons.push(reason);
    } else if (reason.type === AdjudicationReason.Undervote) {
      undervoteReasons.push(reason);
    }
  }

  if (isCrossover) {
    return <CrossoverVotingWarningScreen isTestMode={isTestMode} />;
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

  // @coverage-defer
  return <OtherReasonWarningScreen isTestMode={isTestMode} />;
}
