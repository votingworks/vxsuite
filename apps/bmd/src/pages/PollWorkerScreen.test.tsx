import React from 'react';
import { asElectionDefinition } from '@votingworks/fixtures';
import { Election, VotingMethod } from '@votingworks/types';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  TallySourceMachineType,
  PrecinctScannerCardTally,
} from '@votingworks/utils';
import { getZeroCompressedTally } from '@votingworks/test-utils';
import {
  PrecinctSelectionKind,
  VxMarkOnly,
  VxPrintOnly,
} from '../config/types';

import { render } from '../../test/testUtils';

import electionSampleWithSeal from '../data/electionSampleWithSeal.json';
import { defaultPrecinctId } from '../../test/helpers/election';

import PollWorkerScreen from './PollWorkerScreen';
import fakePrinter from '../../test/helpers/fakePrinter';
import fakeMachineConfig from '../../test/helpers/fakeMachineConfig';

jest.useFakeTimers();

test('renders PollWorkerScreen', async () => {
  const election = electionSampleWithSeal as Election;
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  );

  screen.getByText(/Polls are currently open./);
});

test('switching out of test mode on election day', async () => {
  const election = {
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  } as Election;
  const enableLiveMode = jest.fn();
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  );

  screen.getByText('Switch to Live Election Mode?');
  fireEvent.click(screen.getByText('Switch to Live Mode'));
  expect(enableLiveMode).toHaveBeenCalled();
});

test('keeping test mode on election day', async () => {
  const election = {
    ...electionSampleWithSeal,
    date: new Date().toISOString(),
  } as Election;
  const enableLiveMode = jest.fn();
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode={false}
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  );

  screen.getByText('Switch to Live Election Mode?');
  fireEvent.click(screen.getByText('Cancel'));
  expect(enableLiveMode).not.toHaveBeenCalled();
});

test('live mode on election day', async () => {
  const election = electionSampleWithSeal as Election;
  const enableLiveMode = jest.fn();
  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={enableLiveMode}
      hasVotes={false}
      isLiveMode
      isPollsOpen
      machineConfig={fakeMachineConfig({ appMode: VxMarkOnly })}
      printer={fakePrinter()}
      togglePollsOpen={jest.fn()}
      tallyOnCard={undefined}
      clearTalliesOnCard={jest.fn()}
    />
  );

  expect(screen.queryByText('Switch to Live Election Mode?')).toBeNull();
});

test('printing precinct scanner report option is shown when precinct scanner tally data is on the card', async () => {
  const election = electionSampleWithSeal as Election;
  const clearTallies = jest.fn();
  const printFn = jest.fn();

  const existingTally = getZeroCompressedTally(election);
  existingTally[0] = [6, 0, 34, 6, 5, 6, 5, 3, 0, 3]; // add tallies to the president contest
  const tallyOnCard: PrecinctScannerCardTally = {
    tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
    tally: existingTally,
    totalBallotsScanned: 25,
    machineId: '001',
    timeSaved: new Date('2020-10-31').getTime(),
    precinctSelection: { kind: PrecinctSelectionKind.AllPrecincts },
    isLiveMode: false,
    isPollsOpen: false,
    absenteeBallots: 5,
    precinctBallots: 20,
  };

  render(
    <PollWorkerScreen
      activateCardlessVoterSession={jest.fn()}
      resetCardlessVoterSession={jest.fn()}
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: defaultPrecinctId,
      }}
      electionDefinition={asElectionDefinition(election)}
      enableLiveMode={jest.fn()}
      hasVotes={false}
      isLiveMode
      isPollsOpen={false}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
        machineId: '314',
      })}
      printer={{
        ...fakePrinter(),
        print: printFn,
      }}
      togglePollsOpen={jest.fn()}
      tallyOnCard={tallyOnCard}
      clearTalliesOnCard={clearTallies}
    />
  );

  screen.getByText('Tally Report on Card');
  fireEvent.click(screen.getByText('Print Tally Report'));

  await waitFor(() => {
    expect(clearTallies).toHaveBeenCalledTimes(1);
    expect(printFn).toHaveBeenCalledTimes(1);
  });
  const table = screen.getAllByTestId('voting-method-table')[0];
  within(within(table).getByTestId(VotingMethod.Precinct)).getByText('20');
  within(within(table).getByTestId(VotingMethod.Absentee)).getByText('5');
  within(within(table).getByTestId('total')).getByText('25');
  const presidentContest = screen.getAllByTestId('results-table-president')[0];
  within(presidentContest).getByText(/34 ballots/);
  within(presidentContest).getByText(/6 undervotes/);
  within(presidentContest).getByText(/0 overvotes/);
  within(
    within(presidentContest).getByTestId('president-barchi-hallaren')
  ).getByText('6');
  within(
    within(presidentContest).getByTestId('president-cramer-vuocolo')
  ).getByText('5');
  within(
    within(presidentContest).getByTestId('president-court-blumhardt')
  ).getByText('6');
  within(
    within(presidentContest).getByTestId('president-boone-lian')
  ).getByText('5');
  within(
    within(presidentContest).getByTestId('president-hildebrand-garritty')
  ).getByText('3');
  within(
    within(presidentContest).getByTestId('president-patterson-lariviere')
  ).getByText('0');
  // There are no write ins allowed on this contest, the write ins in the tally will be ignored.
  expect(within(presidentContest).queryAllByText('Write-In')).toHaveLength(0);

  const senatorContest = screen.getAllByTestId('results-table-senator')[0];
  within(senatorContest).getByText(/0 ballots/);
  within(senatorContest).getByText(/0 undervotes/);
  within(senatorContest).getByText(/0 overvotes/);
  expect(within(senatorContest).getAllByText('0')).toHaveLength(7); // All 7 candidates should have 0 totals
});
