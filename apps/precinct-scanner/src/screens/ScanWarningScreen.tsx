import {
  AdjudicationReason,
  CandidateContest,
  ElectionDefinition,
  AdjudicationReasonInfo,
  OvervoteAdjudicationReasonInfo,
  UndervoteAdjudicationReasonInfo,
} from '@votingworks/types';
import { Button, Prose, Text } from '@votingworks/ui';
import { integers, take } from '@votingworks/utils';
import { strict as assert } from 'assert';
import pluralize from 'pluralize';
import React, { useCallback, useContext, useState } from 'react';
import { Absolute } from '../components/Absolute';
import { Bar } from '../components/Bar';
import { ExclamationTriangle } from '../components/Graphics';
import { CenteredLargeProse, CenteredScreen } from '../components/Layout';
import Modal from '../components/Modal';

import AppContext from '../contexts/AppContext';
import { toSentence } from '../utils/toSentence';

export interface Props {
  acceptBallot: () => Promise<void>;
  adjudicationReasonInfo: readonly AdjudicationReasonInfo[];
}

interface OvervoteWarningScreenProps {
  electionDefinition: ElectionDefinition;
  overvotes: readonly OvervoteAdjudicationReasonInfo[];
  acceptBallot: () => Promise<void>;
}

const OvervoteWarningScreen = ({
  electionDefinition,
  overvotes,
  acceptBallot,
}: OvervoteWarningScreenProps): JSX.Element => {
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  const openConfirmTabulateModal = useCallback(
    () => setConfirmTabulate(true),
    []
  );
  const closeConfirmTabulateModal = useCallback(
    () => setConfirmTabulate(false),
    []
  );

  const tabulateBallot = useCallback(async () => {
    closeConfirmTabulateModal();
    await acceptBallot();
  }, [acceptBallot, closeConfirmTabulateModal]);

  const contests = electionDefinition.election.contests.filter((c) =>
    overvotes.some((r) => c.id === r.contestId)
  );
  const contestNames = toSentence(
    contests.map(({ id, title }) => <strong key={id}>{title}</strong>)
  );

  return (
    <CenteredScreen infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Ballot Requires Review</h1>
        <p>Too many marks for:</p>
        <p>{contestNames}</p>
        <Text italic>
          Remove ballot and ask a poll worker for a new ballot.
        </Text>
      </CenteredLargeProse>
      <Absolute bottom left right>
        <Bar style={{ justifyContent: 'flex-end' }}>
          <div>
            Optionally, this ballot may be counted as-is:{' '}
            <Button onPress={openConfirmTabulateModal}>Count Ballot</Button>
          </div>
        </Bar>
      </Absolute>
      {confirmTabulate && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Count ballot with errors?</h1>
              <p>
                {pluralize('contest', overvotes.length, true)} will not be
                counted.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={tabulateBallot}>
                Yes, count ballot with errors
              </Button>
              <Button onPress={closeConfirmTabulateModal}>
                No, return my ballot
              </Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmTabulateModal}
        />
      )}
    </CenteredScreen>
  );
};

interface UndervoteWarningScreenProps {
  electionDefinition: ElectionDefinition;
  undervotes: readonly UndervoteAdjudicationReasonInfo[];
  acceptBallot: () => Promise<void>;
}

const UndervoteWarningScreen = ({
  electionDefinition,
  undervotes,
  acceptBallot,
}: UndervoteWarningScreenProps): JSX.Element => {
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  const openConfirmTabulateModal = useCallback(
    () => setConfirmTabulate(true),
    []
  );
  const closeConfirmTabulateModal = useCallback(
    () => setConfirmTabulate(false),
    []
  );

  const tabulateBallot = useCallback(async () => {
    closeConfirmTabulateModal();
    await acceptBallot();
  }, [acceptBallot, closeConfirmTabulateModal]);

  const contests = electionDefinition.election.contests.filter((c) =>
    undervotes.some((r) => c.id === r.contestId)
  );
  const contestNames = toSentence(
    contests.map(({ id, title }) => <strong key={id}>{title}</strong>)
  );

  const singleCandidateUndervote =
    undervotes.length === 1 && contests[0].type === 'candidate'
      ? undervotes[0]
      : undefined;
  const remainingChoices = singleCandidateUndervote
    ? singleCandidateUndervote.expected -
      singleCandidateUndervote.optionIds.length
    : 0;

  return (
    <CenteredScreen infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Ballot Requires Review</h1>
        <p>
          {singleCandidateUndervote
            ? singleCandidateUndervote.optionIds.length === 0
              ? 'You may still vote in this contest:'
              : `You may still vote for ${remainingChoices} more ${pluralize(
                  'candidate',
                  remainingChoices
                )} in this contest:`
            : 'You may still vote in these contests:'}
        </p>
        <p>{contestNames}</p>
        <p>Remove the ballot, fix the issue, then scan again.</p>
        <Text italic>Ask a poll worker if you need assistance.</Text>
      </CenteredLargeProse>
      <Absolute bottom left right>
        <Bar style={{ justifyContent: 'flex-end' }}>
          <div>
            Optionally, this ballot may be counted as-is:{' '}
            <Button onPress={openConfirmTabulateModal}>Count Ballot</Button>
          </div>
        </Bar>
      </Absolute>
      {confirmTabulate && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Count ballot with undervotes?</h1>
              <p>
                You may still vote in{' '}
                {pluralize('contest', undervotes.length, true)}.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={tabulateBallot}>
                Yes, count ballot with undervotes
              </Button>
              <Button onPress={closeConfirmTabulateModal}>
                No, return my ballot
              </Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmTabulateModal}
        />
      )}
    </CenteredScreen>
  );
};

interface BlankBallotWarningScreenProps {
  acceptBallot: () => Promise<void>;
}

const BlankBallotWarningScreen = ({
  acceptBallot,
}: BlankBallotWarningScreenProps): JSX.Element => {
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  const openConfirmTabulateModal = useCallback(
    () => setConfirmTabulate(true),
    []
  );
  const closeConfirmTabulateModal = useCallback(
    () => setConfirmTabulate(false),
    []
  );

  const tabulateBallot = useCallback(async () => {
    closeConfirmTabulateModal();
    await acceptBallot();
  }, [acceptBallot, closeConfirmTabulateModal]);

  return (
    <CenteredScreen infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Blank Ballot</h1>
        <p>Remove the ballot, fix the issue, then scan again.</p>
        <Text italic>Ask a poll worker if you need assistance.</Text>
      </CenteredLargeProse>
      <Absolute bottom left right>
        <Bar style={{ justifyContent: 'flex-end' }}>
          <div>
            Optionally, this ballot may be counted as-is:{' '}
            <Button onPress={openConfirmTabulateModal}>Count Ballot</Button>
          </div>
        </Bar>
      </Absolute>
      {confirmTabulate && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Count blank ballot?</h1>
              <p>No votes will be counted from this ballot.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={tabulateBallot}>
                Yes, count blank ballot
              </Button>
              <Button onPress={closeConfirmTabulateModal}>
                No, return my ballot
              </Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmTabulateModal}
        />
      )}
    </CenteredScreen>
  );
};

interface OtherReasonWarningScreenProps {
  acceptBallot: () => Promise<void>;
}

const OtherReasonWarningScreen = ({
  acceptBallot,
}: OtherReasonWarningScreenProps): JSX.Element => {
  const [confirmTabulate, setConfirmTabulate] = useState(false);
  const openConfirmTabulateModal = useCallback(
    () => setConfirmTabulate(true),
    []
  );
  const closeConfirmTabulateModal = useCallback(
    () => setConfirmTabulate(false),
    []
  );

  const tabulateBallot = useCallback(async () => {
    closeConfirmTabulateModal();
    await acceptBallot();
  }, [acceptBallot, closeConfirmTabulateModal]);

  return (
    <CenteredScreen infoBar={false}>
      <ExclamationTriangle />
      <CenteredLargeProse>
        <h1>Ballot Requires Review</h1>
        <p>Remove the ballot, fix the issue, then scan again.</p>
        <Text italic>Ask a poll worker if you need assistance.</Text>
      </CenteredLargeProse>
      <Absolute bottom left right>
        <Bar style={{ justifyContent: 'flex-end' }}>
          <div>
            Optionally, this ballot may be counted as-is:{' '}
            <Button onPress={openConfirmTabulateModal}>Count Ballot</Button>
          </div>
        </Bar>
      </Absolute>
      {confirmTabulate && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Count ballot with errors?</h1>
              <p>Contests with errors will not be counted.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={tabulateBallot}>
                Yes, count ballot with errors
              </Button>
              <Button onPress={closeConfirmTabulateModal}>
                No, return my ballot
              </Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmTabulateModal}
        />
      )}
    </CenteredScreen>
  );
};

const ScanWarningScreen = ({
  acceptBallot,
  adjudicationReasonInfo,
}: Props): JSX.Element => {
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
    return <BlankBallotWarningScreen acceptBallot={acceptBallot} />;
  }

  if (overvoteReasons.length > 0) {
    return (
      <OvervoteWarningScreen
        electionDefinition={electionDefinition}
        overvotes={overvoteReasons}
        acceptBallot={acceptBallot}
      />
    );
  }

  if (undervoteReasons.length > 0) {
    return (
      <UndervoteWarningScreen
        electionDefinition={electionDefinition}
        undervotes={undervoteReasons}
        acceptBallot={acceptBallot}
      />
    );
  }

  return <OtherReasonWarningScreen acceptBallot={acceptBallot} />;
};

export default ScanWarningScreen;

/* istanbul ignore next */
export const OvervotePreview = (): JSX.Element => {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.seats === 1 && c.candidates.length > 1
  );
  assert(contest);

  return (
    <ScanWarningScreen
      acceptBallot={() => Promise.resolve()}
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
};

/* istanbul ignore next */
export const UndervoteNoVotesPreview = (): JSX.Element => {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contest);

  return (
    <ScanWarningScreen
      acceptBallot={() => Promise.resolve()}
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
};

/* istanbul ignore next */
export const UndervoteBy1Preview = (): JSX.Element => {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  );
  assert(contest);

  return (
    <ScanWarningScreen
      acceptBallot={() => Promise.resolve()}
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
};

/* istanbul ignore next */
export const UndervoteByNPreview = (): JSX.Element => {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  );
  assert(contest);

  const undervotedOptionCount = 1;
  return (
    <ScanWarningScreen
      acceptBallot={() => Promise.resolve()}
      adjudicationReasonInfo={[
        {
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          optionIds: contest.candidates
            .slice(0, undervotedOptionCount)
            .map(({ id }) => id),
          optionIndexes: take(undervotedOptionCount, integers()),
          expected: contest.seats,
        },
      ]}
    />
  );
};

/* istanbul ignore next */
export const MultipleUndervotesPreview = (): JSX.Element => {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);

  const contests = electionDefinition.election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contests.length > 0);

  return (
    <ScanWarningScreen
      acceptBallot={() => Promise.resolve()}
      adjudicationReasonInfo={contests.map((contest) => ({
        type: AdjudicationReason.Undervote,
        contestId: contest.id,
        optionIds: contest.candidates.slice(0, 1).map(({ id }) => id),
        optionIndexes: [0, 1],
        expected: contest.seats,
      }))}
    />
  );
};

/* istanbul ignore next */
export const BlankBallotPreview = (): JSX.Element => {
  return (
    <ScanWarningScreen
      acceptBallot={() => Promise.resolve()}
      adjudicationReasonInfo={[{ type: AdjudicationReason.BlankBallot }]}
    />
  );
};

/* istanbul ignore next */
export const UninterpretableBallotPreview = (): JSX.Element => {
  return (
    <ScanWarningScreen
      acceptBallot={() => Promise.resolve()}
      adjudicationReasonInfo={[
        { type: AdjudicationReason.UninterpretableBallot },
      ]}
    />
  );
};
