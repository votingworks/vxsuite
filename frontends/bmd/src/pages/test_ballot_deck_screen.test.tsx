import React from 'react';
import { fireEvent, waitFor, act, screen } from '@testing-library/react';
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakePrinterInfo,
  mockOf,
} from '@votingworks/test-utils';
import { render } from '../../test/test_utils';
import { randomBase64 } from '../utils/random';
import { TestBallotDeckScreen } from './test_ballot_deck_screen';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { PrecinctSelectionKind, PrintOnly } from '../config/types';
import { fakePrinter } from '../../test/helpers/fake_printer';
import { electionSampleDefinition } from '../data';

// mock the random value so the snapshots match
jest.mock('../utils/random');

beforeEach(() => {
  jest.useFakeTimers();
  mockOf(randomBase64).mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w');
});

it('renders test decks appropriately', async () => {
  const printer = fakePrinter();
  render(
    <TestBallotDeckScreen
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: '23',
      }}
      electionDefinition={electionSampleDefinition}
      hideTestDeck={jest.fn()}
      machineConfig={fakeMachineConfig({
        appMode: PrintOnly,
      })}
      isLiveMode={false}
      printer={printer}
    />
  );

  fireEvent.click(screen.getByText('All Precincts'));

  expect(screen.getAllByText('Unofficial TEST Ballot')).toHaveLength(63);
  expect(screen.getAllByText('For either', { exact: false })).toHaveLength(31);
  expect(
    screen.getAllByText('FOR Measure 420A', { exact: false })
  ).toHaveLength(31);
  expect(screen.getAllByText('County Commissioners')).toHaveLength(52);

  fireEvent.click(screen.getByText('Print 63 ballots'));

  expect(printer.print).toHaveBeenCalled();

  const kiosk = fakeKiosk();
  window.kiosk = kiosk;
  kiosk.getPrinterInfo = jest
    .fn()
    .mockResolvedValue([fakePrinterInfo({ connected: true })]);

  fireEvent.click(screen.getByText('Print 63 ballots'));

  await waitFor(() => {
    expect(printer.print).toHaveBeenCalledWith({ sides: 'one-sided' });
  });

  screen.getByText('Printing Ballots…');
  act(() => {
    jest.advanceTimersByTime(66000);
  });
  expect(screen.queryAllByText('Printing Ballots…').length).toBe(0);
});

it('shows printer not connected when appropriate', async () => {
  render(
    <TestBallotDeckScreen
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: '23',
      }}
      electionDefinition={electionSampleDefinition}
      machineConfig={fakeMachineConfig({
        appMode: PrintOnly,
      })}
      hideTestDeck={jest.fn()}
      isLiveMode={false}
      printer={fakePrinter()}
    />
  );

  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fireEvent.click(screen.getByText('All Precincts'));

  fireEvent.click(screen.getByText('Print 63 ballots'));
  await advanceTimersAndPromises();

  expect(kiosk.getPrinterInfo).toHaveBeenCalled();

  await waitFor(() => {
    screen.getByText('The printer is not connected.');
  });

  fireEvent.click(screen.getByText('OK'));
});
