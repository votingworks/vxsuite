import React, { useContext, useState } from 'react';
import {
  AdjudicationReason,
  CandidateContest,
  ElectionDefinition,
  AdjudicationReasonInfo,
  OvervoteAdjudicationReasonInfo,
  UndervoteAdjudicationReasonInfo,
} from '@votingworks/types';
import { Button, Modal, Prose, Text } from '@votingworks/ui';
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
  const contestNames = overvotes.map(
    (overvote) =>
      find(
        electionDefinition.election.contests,
        (contest) => contest.id === overvote.contestId
      ).title
  );

  return (
    <ScreenMainCenterChild infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Too Many Votes</h1>
        <Text small>
          You voted for too many choices for {toSentence(contestNames)}. To fix
          this, take your ballot and ask a poll worker for a new ballot.
        </Text>
        <p>
          <Button primary large onPress={scanner.returnBallot}>
            Return my ballot
          </Button>
        </p>
        <p>
          <Button small onPress={() => setConfirmTabulate(true)}>
            Count my ballot
          </Button>
        </p>
        <Text italic>Ask a poll worker if you need help.</Text>
      </CenteredLargeProse>
      {confirmTabulate && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Are you sure?</h1>
              <p>
                Your votes for {pluralize('contest', overvotes.length, true)}{' '}
                will not be counted.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={scanner.acceptBallot}>
                Yes, count my ballot
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

  return (
    <ScreenMainCenterChild infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Review Your Ballot</h1>
        {blankContestNames.length > 0 && (
          <Text small>
            You did not vote for {toSentence(blankContestNames, ', ', ' or ')}.
          </Text>
        )}
        {partiallyVotedContestNames.length > 0 && (
          <Text small>
            You can vote for more people for{' '}
            {toSentence(partiallyVotedContestNames, ', ', ' and ')}.
          </Text>
        )}
        <p>
          <Button primary large onPress={() => setConfirmTabulate(true)}>
            Count my ballot
          </Button>
        </p>
        <p>
          <Button small onPress={scanner.returnBallot}>
            Return my ballot
          </Button>
        </p>
        <Text italic>Ask a poll worker if you need help.</Text>
      </CenteredLargeProse>
      {confirmTabulate && (
        <Modal
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
                    You can vote for more people in{' '}
                    {pluralize(
                      'contest',
                      partiallyVotedContestNames.length,
                      true
                    )}
                    .
                  </span>
                )}
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={scanner.acceptBallot}>
                Yes, count my ballot
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
        <h1>Blank Ballot</h1>
        <p>Your ballot does not have any votes.</p>
        <p>
          <Button primary large onPress={scanner.returnBallot}>
            Return my ballot
          </Button>
        </p>
        <p>
          <Button small onPress={() => setConfirmTabulate(true)}>
            Count blank ballot
          </Button>
        </p>
        <Text italic>Ask a poll worker if you need help.</Text>
      </CenteredLargeProse>
      {confirmTabulate && (
        <Modal
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
        <h1>Review Your Ballot</h1>
        <p>
          <Button primary large onPress={scanner.returnBallot}>
            Return my ballot
          </Button>
        </p>
        <p>
          <Button small onPress={() => setConfirmTabulate(true)}>
            Count my ballot
          </Button>
        </p>
        <Text italic>Ask a poll worker if you need help.</Text>
      </CenteredLargeProse>
      {confirmTabulate && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Are you sure?</h1>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={scanner.acceptBallot}>
                Yes, count my ballot
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
export function MultipleUndervotesPreview(): JSX.Element {
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
