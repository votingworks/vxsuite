import {
  // electionSample,
  parseElection,
} from '@votingworks/types';
// TODO: Tally: Use electionSample from @votingworks/fixtures once published.

import React from 'react';
import { fireEvent, waitFor, act, screen } from '@testing-library/react';
import { asElectionDefinition } from '@votingworks/fixtures';
import { fakeKiosk, fakePrinterInfo, mockOf } from '@votingworks/test-utils';
import electionSample from '../data/electionSample.json';
import { render } from '../../test/testUtils';
import { randomBase64 } from '../utils/random';
import TestBallotDeckScreen from './TestBallotDeckScreen';
import fakeMachineConfig from '../../test/helpers/fakeMachineConfig';
import { PrecinctSelectionKind, VxPrintOnly } from '../config/types';
import fakePrinter from '../../test/helpers/fakePrinter';

// mock the random value so the snapshots match
jest.mock('../utils/random');
const randomBase64Mock = mockOf(randomBase64);
randomBase64Mock.mockReturnValue('CHhgYxfN5GeqnK8KaVOt1w');

it('renders test decks appropriately', async () => {
  const printer = fakePrinter();
  render(
    <TestBallotDeckScreen
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: '23',
      }}
      electionDefinition={asElectionDefinition(parseElection(electionSample))}
      hideTestDeck={jest.fn()}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
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

  jest.useFakeTimers();
  fireEvent.click(screen.getByText('Print 63 ballots'));

  await waitFor(() => {
    expect(printer.print).toHaveBeenCalledWith({ sides: 'one-sided' });
  });

  screen.getByText('Printing Ballots…');
  act(() => {
    jest.advanceTimersByTime(66000);
  });
  expect(screen.queryAllByText('Printing Ballots…').length).toBe(0);
  jest.useRealTimers();
});

it('shows printer not connected when appropriate', async () => {
  render(
    <TestBallotDeckScreen
      appPrecinct={{
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId: '23',
      }}
      electionDefinition={asElectionDefinition(parseElection(electionSample))}
      machineConfig={fakeMachineConfig({
        appMode: VxPrintOnly,
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

  expect(kiosk.getPrinterInfo).toHaveBeenCalled();

  await waitFor(() => {
    screen.getByText('The printer is not connected.');
  });

  fireEvent.click(screen.getByText('OK'));
});
