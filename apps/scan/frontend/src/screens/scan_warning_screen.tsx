import React from 'react';
import {
  AdjudicationReason,
  BallotStyleId,
  CandidateContest,
  ContestId,
  ElectionDefinition,
  AdjudicationReasonInfo,
  OvervoteAdjudicationReasonInfo,
  UndervoteAdjudicationReasonInfo,
  Contest,
  SystemSettings,
  VotesDict,
  DEFAULT_SYSTEM_SETTINGS,
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
import { assert } from '@votingworks/basics';

import { Screen } from '../components/layout';

import { acceptBallot, getConfig, returnBallot } from '../api';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { MisvoteWarnings } from '../components/misvote_warnings';
import { BallotReviewScreen } from './ballot_review_screen';

interface MisvoteWarningScreenProps {
  electionDefinition: ElectionDefinition;
  systemSettings: SystemSettings;
  overvotes: readonly OvervoteAdjudicationReasonInfo[];
  undervotes: readonly UndervoteAdjudicationReasonInfo[];
  isTestMode: boolean;
  returnBallotIsPrimary: boolean;
  onReview: () => void;
}

function MisvoteWarningScreen({
  electionDefinition,
  systemSettings,
  overvotes,
  undervotes,
  isTestMode,
  returnBallotIsPrimary,
  onReview,
}: MisvoteWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const [hasReturnedBallot, setHasReturnedBallot] = React.useState(false);
  const allowCastingOvervotes = !systemSettings.disallowCastingOvervotes;

  function onReturnBallot() {
    setHasReturnedBallot(true);
    returnBallotMutation.mutate();
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

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant={returnBallotIsPrimary ? 'primary' : undefined}
            onPress={onReturnBallot}
            disabled={hasReturnedBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>

          {(allowCastingOvervotes || overvoteContests.length === 0) && (
            <Button
              id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
              variant={returnBallotIsPrimary ? undefined : 'primary'}
              onPress={onReview}
              disabled={hasReturnedBallot}
            >
              {appStrings.buttonReviewYourVotes()}
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
  onReview: () => void;
}

function BlankBallotWarningScreen({
  isTestMode,
  onReview,
}: BlankBallotWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const [hasReturnedBallot, setHasReturnedBallot] = React.useState(false);

  function onReturnBallot() {
    setHasReturnedBallot(true);
    returnBallotMutation.mutate();
  }

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            onPress={onReturnBallot}
            disabled={hasReturnedBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={onReview}
            disabled={hasReturnedBallot}
          >
            {appStrings.buttonReviewYourVotes()}
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
  onReview: () => void;
}

function CrossoverVotingWarningScreen({
  isTestMode,
  onReview,
}: CrossoverVotingWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const [hasReturnedBallot, setHasReturnedBallot] = React.useState(false);

  function onReturnBallot() {
    setHasReturnedBallot(true);
    returnBallotMutation.mutate();
  }

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            onPress={onReturnBallot}
            disabled={hasReturnedBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={onReview}
            disabled={hasReturnedBallot}
          >
            {appStrings.buttonReviewYourVotes()}
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
  onReview: () => void;
}

function OtherReasonWarningScreen({
  isTestMode,
  onReview,
}: OtherReasonWarningScreenProps): JSX.Element {
  const returnBallotMutation = returnBallot.useMutation();
  const [hasReturnedBallot, setHasReturnedBallot] = React.useState(false);

  function onReturnBallot() {
    setHasReturnedBallot(true);
    returnBallotMutation.mutate();
  }

  return (
    <Screen
      actionButtons={
        <React.Fragment>
          <Button
            id={PageNavigationButtonId.PREVIOUS_AFTER_CONFIRM}
            variant="primary"
            onPress={onReturnBallot}
            disabled={hasReturnedBallot}
          >
            {appStrings.buttonReturnBallot()}
          </Button>
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={onReview}
            disabled={hasReturnedBallot}
          >
            {appStrings.buttonReviewYourVotes()}
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
  ballotStyleId: BallotStyleId;
  votes: VotesDict;
  adjudicationReasonInfo: readonly AdjudicationReasonInfo[];
  systemSettings: SystemSettings;
  isTestMode: boolean;
}

export function ScanWarningScreen({
  electionDefinition,
  ballotStyleId,
  votes,
  adjudicationReasonInfo,
  systemSettings,
  isTestMode,
}: Props): JSX.Element {
  const acceptBallotMutation = acceptBallot.useMutation();
  const [hasCastBallot, setHasCastBallot] = React.useState(false);
  const [showBallotReviewScreen, setShowBallotReviewScreen] =
    React.useState(false);

  function onCastBallot() {
    setHasCastBallot(true);
    acceptBallotMutation.mutate();
  }

  function onReview() {
    setShowBallotReviewScreen(true);
  }

  let isBlank = false;
  let isCrossover = false;
  const overvoteReasons: OvervoteAdjudicationReasonInfo[] = [];
  const undervoteReasons: UndervoteAdjudicationReasonInfo[] = [];

  for (const reason of adjudicationReasonInfo) {
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

  // We nudge the voter toward returning the ballot for every warning except
  // undervotes alone, since undervotes are often intentional. Whichever action
  // is primary here stays primary on the ballot review screen.
  const isUndervoteOnlyWarning =
    !isBlank &&
    !isCrossover &&
    overvoteReasons.length === 0 &&
    undervoteReasons.length > 0;
  const returnBallotIsPrimary = !isUndervoteOnlyWarning;

  // Once the voter chooses to review, show the detailed ballot review screen
  // (with over/undervote and blank-contest warnings) where they cast or return.
  if (showBallotReviewScreen) {
    const overvoteContestIds = new Set<ContestId>(
      overvoteReasons.map((reason) => reason.contestId)
    );
    return (
      <BallotReviewScreen
        electionDefinition={electionDefinition}
        ballotStyleId={ballotStyleId}
        votes={votes}
        isTestMode={isTestMode}
        hasCastBallot={hasCastBallot}
        onCastBallot={onCastBallot}
        overvoteContestIds={overvoteContestIds}
        returnBallotIsPrimary={returnBallotIsPrimary}
      />
    );
  }

  if (isCrossover) {
    return (
      <CrossoverVotingWarningScreen
        isTestMode={isTestMode}
        onReview={onReview}
      />
    );
  }

  if (isBlank) {
    return (
      <BlankBallotWarningScreen isTestMode={isTestMode} onReview={onReview} />
    );
  }

  if (undervoteReasons.length > 0 || overvoteReasons.length > 0) {
    return (
      <MisvoteWarningScreen
        electionDefinition={electionDefinition}
        systemSettings={systemSettings}
        undervotes={undervoteReasons}
        overvotes={overvoteReasons}
        isTestMode={isTestMode}
        returnBallotIsPrimary={returnBallotIsPrimary}
        onReview={onReview}
      />
    );
  }

  return (
    <OtherReasonWarningScreen isTestMode={isTestMode} onReview={onReview} />
  );
}

/* istanbul ignore next */
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
      votes={{}}
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next */
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
      votes={{}}
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next */
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
      votes={{}}
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next */
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
      votes={{}}
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next */
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
      votes={{}}
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next */
export function CrossoverVotingPreview(): JSX.Element {
  const configQuery = getConfig.useQuery();
  const electionDefinition = configQuery.data?.electionDefinition;

  if (!electionDefinition) {
    return <P>Loading…</P>;
  }

  return (
    <ScanWarningScreen
      electionDefinition={electionDefinition}
      systemSettings={DEFAULT_SYSTEM_SETTINGS}
      adjudicationReasonInfo={[{ type: AdjudicationReason.CrossoverVoting }]}
      votes={{}}
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      isTestMode={false}
    />
  );
}

/* istanbul ignore next */
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
      votes={{}}
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      isTestMode={false}
    />
  );
}
