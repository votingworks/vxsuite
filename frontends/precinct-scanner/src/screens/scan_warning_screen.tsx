import React, { useContext, useState } from 'react';
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
  fontSizeTheme,
  Modal,
  ModalWidth,
  Prose,
  Text,
} from '@votingworks/ui';
import { assert, find, integers, take } from '@votingworks/utils';
import pluralize from 'pluralize';
import * as scanner from '../api/scan';

import { ExclamationTriangle } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

import { AppContext } from '../contexts/app_context';
import { toSentence } from '../utils/to_sentence';

interface OvervoteWarningScreenProps {
  electionDefinition: ElectionDefinition;
  overvotes: readonly OvervoteAdjudicationReasonInfo[];
}

function OvervoteWarningScreen({
  electionDefinition,
  overvotes,
}: OvervoteWarningScreenProps): JSX.Element {
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  const contestNames = overvotes
    .map((overvote) =>
      find(
        electionDefinition.election.contests,
        (contest) => contest.id === overvote.contestId
      )
    )
    .reduce<AnyContest[]>(
      (a, c) => (a.findIndex((o) => o.title === c.title) >= 0 ? a : [...a, c]),
      []
    )
    .map((c) => c.title);

  return (
    <ScreenMainCenterChild infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Too Many Votes</h1>
        <Text>
          There are too many votes marked in the{' '}
          {pluralize('contest', contestNames.length)} for:{' '}
          {toSentence(contestNames)}.
        </Text>
        <p>
          <Button primary onPress={scanner.returnBallot}>
            Return Ballot
          </Button>{' '}
          or{' '}
          <Button onPress={() => setConfirmTabulate(true)}>
            Cast Ballot As Is
          </Button>
        </p>
        <Text italic small>
          Ask a poll worker if you need help.
        </Text>
      </CenteredLargeProse>
      {confirmTabulate && (
        <Modal
          theme={fontSizeTheme.large}
          modalWidth={ModalWidth.Wide}
          content={
            <Prose textCenter>
              <h1>Are you sure?</h1>
              <p>
                Your votes in {pluralize('contest', contestNames.length, true)}{' '}
                will not be counted.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={scanner.acceptBallot}>
                Yes, Cast Ballot As Is
              </Button>
              <Button onPress={() => setConfirmTabulate(false)}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={() => setConfirmTabulate(false)}
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
    <ScreenMainCenterChild infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Review Your Ballot</h1>
        {blankContestNames.length > 0 && (
          <p>
            No votes detected for:{' '}
            {toSentence(truncateContestNames(blankContestNames))}.
          </p>
        )}
        {partiallyVotedContestNames.length > 0 && (
          <p>
            You may vote for more candidates in the contests for:{' '}
            {toSentence(truncateContestNames(partiallyVotedContestNames))}.
          </p>
        )}
        <p>
          <Button onPress={scanner.returnBallot}>Return Ballot</Button> or{' '}
          <Button primary onPress={() => setConfirmTabulate(true)}>
            Cast Ballot As Is
          </Button>
        </p>
        <Text italic small>
          Your votes will count, even if you leave some blank.
          <br />
          Ask a poll worker if you need help.
        </Text>
      </CenteredLargeProse>
      {confirmTabulate && (
        <Modal
          theme={fontSizeTheme.large}
          modalWidth={ModalWidth.Wide}
          content={
            <Prose textCenter>
              <h1>Are you sure?</h1>
              <p>
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
              </p>
              <Text italic>
                Your votes will count, even if you leave some blank.
              </Text>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={scanner.acceptBallot}>
                Yes, Cast Ballot As Is
              </Button>
              <Button onPress={() => setConfirmTabulate(false)}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={() => setConfirmTabulate(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

function BlankBallotWarningScreen(): JSX.Element {
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  return (
    <ScreenMainCenterChild infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Review Your Ballot</h1>
        <p>No votes were found when scanning this ballot.</p>
        <p>
          <Button primary onPress={scanner.returnBallot}>
            Return Ballot
          </Button>{' '}
          or{' '}
          <Button onPress={() => setConfirmTabulate(true)}>
            Cast Ballot As Is
          </Button>
        </p>
        <Text small italic>
          Your votes will count, even if you leave some blank.
          <br />
          Ask a poll worker if you need help.
        </Text>
      </CenteredLargeProse>
      {confirmTabulate && (
        <Modal
          theme={fontSizeTheme.large}
          modalWidth={ModalWidth.Wide}
          content={
            <Prose textCenter>
              <h1>Are you sure?</h1>
              <p>No votes will be counted from this ballot.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={scanner.acceptBallot}>
                Yes, count blank ballot
              </Button>
              <Button onPress={() => setConfirmTabulate(false)}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={() => setConfirmTabulate(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

function OtherReasonWarningScreen(): JSX.Element {
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  return (
    <ScreenMainCenterChild infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Scanning Failed</h1>
        <p>There was a problem scanning this ballot.</p>
        <p>
          <Button primary onPress={scanner.returnBallot}>
            Return Ballot
          </Button>{' '}
          or{' '}
          <Button onPress={() => setConfirmTabulate(true)}>
            Cast Ballot As Is
          </Button>
        </p>
        <Text small italic>
          Ask a poll worker if you need help.
        </Text>
      </CenteredLargeProse>
      {confirmTabulate && (
        <Modal
          theme={fontSizeTheme.large}
          modalWidth={ModalWidth.Wide}
          content={
            <Prose textCenter>
              <h1>Are you sure?</h1>
              <p>No votes will be recorded for this ballot.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={scanner.acceptBallot}>
                Yes, Cast Ballot As Is
              </Button>
              <Button onPress={() => setConfirmTabulate(false)}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={() => setConfirmTabulate(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

export interface Props {
  adjudicationReasonInfo: readonly AdjudicationReasonInfo[];
}

export function ScanWarningScreen({
  adjudicationReasonInfo,
}: Props): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

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
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.seats === 1 && c.candidates.length > 1
  );
  assert(contest);

  return (
    <ScanWarningScreen
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
export function UndervoteNoVotesPreview(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contest);

  return (
    <ScanWarningScreen
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
export function UndervoteBy1Preview(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  );
  assert(contest);

  return (
    <ScanWarningScreen
      adjudicationReasonInfo={[
        {
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          optionIds: contest.candidates
            .slice(0, contest.seats - 1)
            .map(({ id }) => id),
          optionIndexes: take(contest.seats, integers()),
          expected: contest.seats,
        },
      ]}
    />
  );
}

/* istanbul ignore next */
export function UndervoteManyPreview(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contests = electionDefinition.election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contests.length > 0);

  return (
    <ScanWarningScreen
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
  return (
    <ScanWarningScreen
      adjudicationReasonInfo={[{ type: AdjudicationReason.BlankBallot }]}
    />
  );
}

/* istanbul ignore next */
export function UninterpretableBallotPreview(): JSX.Element {
  return (
    <ScanWarningScreen
      adjudicationReasonInfo={[
        { type: AdjudicationReason.UninterpretableBallot },
      ]}
    />
  );
}
