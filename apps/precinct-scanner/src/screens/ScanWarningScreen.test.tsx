import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { AdjudicationReason, CandidateContest } from '@votingworks/types';
import { integers, take } from '@votingworks/utils';
import React from 'react';
import { AppContext } from '../contexts/AppContext';
import { ScanWarningScreen } from './ScanWarningScreen';

test('overvote', async () => {
  const acceptBallot = jest.fn();
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[
          {
            type: AdjudicationReason.Overvote,
            contestId: contest.id,
            optionIds: contest.candidates.map(({ id }) => id),
            optionIndexes: contest.candidates.map((c, i) => i),
            expected: 1,
          },
        ]}
      />
    </AppContext.Provider>
  );

  screen.getByText('Too many marks for:');
  screen.getByText(contest.title);
  userEvent.click(screen.getByText('Count Ballot'));
  userEvent.click(screen.getByText('Yes, count ballot with errors'));
  expect(acceptBallot).toHaveBeenCalledTimes(1);
});

test('blank ballot', async () => {
  const acceptBallot = jest.fn();

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[{ type: AdjudicationReason.BlankBallot }]}
      />
    </AppContext.Provider>
  );

  screen.getByText('Remove the ballot, fix the issue, then scan again.');
  userEvent.click(screen.getByText('Count Ballot'));
  userEvent.click(screen.getByText('Yes, count blank ballot'));
  expect(acceptBallot).toHaveBeenCalledTimes(1);
});

test('undervote no votes', async () => {
  const acceptBallot = jest.fn();
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[
          {
            type: AdjudicationReason.Undervote,
            contestId: contest.id,
            expected: 1,
            optionIds: [],
            optionIndexes: [],
          },
        ]}
      />
    </AppContext.Provider>
  );

  screen.getByText('You may still vote in this contest:');
  screen.getByText(contest.title);
  screen.getByText('Remove the ballot, fix the issue, then scan again.');
  userEvent.click(screen.getByText('Count Ballot'));
  userEvent.click(screen.getByText('Yes, count ballot with undervotes'));
  expect(acceptBallot).toHaveBeenCalledTimes(1);
});

test('undervote by 1', async () => {
  const acceptBallot = jest.fn();
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  )!;

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[
          {
            type: AdjudicationReason.Undervote,
            contestId: contest.id,
            expected: contest.seats,
            optionIds: contest.candidates
              .slice(0, contest.seats - 1)
              .map(({ id }) => id),
            optionIndexes: take(contest.seats, integers()),
          },
        ]}
      />
    </AppContext.Provider>
  );

  screen.getByText('You may still vote for 1 more candidate in this contest:');
  screen.getByText(contest.title);
  screen.getByText('Remove the ballot, fix the issue, then scan again.');
  userEvent.click(screen.getByText('Count Ballot'));
  userEvent.click(screen.getByText('Yes, count ballot with undervotes'));
  expect(acceptBallot).toHaveBeenCalledTimes(1);
});

test('undervote by N', async () => {
  const acceptBallot = jest.fn();
  const contest = electionSampleDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  )!;

  const undervotedOptionCount = 1;
  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[
          {
            type: AdjudicationReason.Undervote,
            contestId: contest.id,
            expected: contest.seats,
            optionIds: contest.candidates
              .slice(0, undervotedOptionCount)
              .map(({ id }) => id),
            optionIndexes: take(undervotedOptionCount, integers()),
          },
        ]}
      />
    </AppContext.Provider>
  );

  screen.getByText('You may still vote for 3 more candidates in this contest:');
  screen.getByText(contest.title);
  screen.getByText('Remove the ballot, fix the issue, then scan again.');
  userEvent.click(screen.getByText('Count Ballot'));
  userEvent.click(screen.getByText('Yes, count ballot with undervotes'));
  expect(acceptBallot).toHaveBeenCalledTimes(1);
});

test('multiple undervotes', async () => {
  const acceptBallot = jest.fn();
  const contests = electionSampleDefinition.election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={contests.map((contest) => ({
          type: AdjudicationReason.Undervote,
          contestId: contest.id,
          expected: contest.seats,
          optionIds: contest.candidates.slice(0, 1).map(({ id }) => id),
          optionIndexes: contest.candidates.slice(0, 1).map((c, i) => i),
        }))}
      />
    </AppContext.Provider>
  );

  screen.getByText('You may still vote in these contests:');
  for (const contest of contests) {
    screen.getByText(contest.title);
  }
  screen.getByText('Remove the ballot, fix the issue, then scan again.');
  userEvent.click(screen.getByText('Count Ballot'));
  userEvent.click(screen.getByText('Yes, count ballot with undervotes'));
  expect(acceptBallot).toHaveBeenCalledTimes(1);
});

test('unreadable', async () => {
  const acceptBallot = jest.fn();

  render(
    <AppContext.Provider
      value={{
        machineConfig: {
          codeVersion: 'test',
          machineId: '000',
        },
        electionDefinition: electionSampleDefinition,
      }}
    >
      <ScanWarningScreen
        acceptBallot={acceptBallot}
        adjudicationReasonInfo={[
          { type: AdjudicationReason.UninterpretableBallot },
        ]}
      />
    </AppContext.Provider>
  );

  screen.getByText('Remove the ballot, fix the issue, then scan again.');
  userEvent.click(screen.getByText('Count Ballot'));
  userEvent.click(screen.getByText('Yes, count ballot with errors'));
  expect(acceptBallot).toHaveBeenCalledTimes(1);
});
