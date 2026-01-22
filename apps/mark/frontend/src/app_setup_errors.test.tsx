import { afterEach, beforeEach, describe, test, vi } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { act, render, screen } from '../test/react_testing_library';

import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { INTERNAL_HARDWARE_POLLING_INTERVAL_MS } from './api';

const electionGeneralDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

const insertCardScreenText = 'Insert Card';

describe('Displays setup warning messages and errors screens', () => {
  test('Displays internal connection problem if Accessible Controller connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);
    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Disconnect Accessible Controller
    act(() => {
      apiMock.setAccessibleControllerConnected(false);
    });
    await advanceTimersAndPromises(
      INTERNAL_HARDWARE_POLLING_INTERVAL_MS / 1000
    );
    await vi.waitFor(() => {
      screen.getByRole('heading', { name: /Internal Connection Problem/i });
      screen.getByText(/Accessible controller is disconnected\./i);
    });

    // Reconnect Accessible Controller
    act(() => {
      apiMock.setAccessibleControllerConnected(true);
    });
    await advanceTimersAndPromises(
      INTERNAL_HARDWARE_POLLING_INTERVAL_MS / 1000
    );
    await vi.waitFor(() => {
      screen.getByText(insertCardScreenText);
    });
  });

  test('Displays internal connection problem if PAT input connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);
    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Disconnect Accessible Controller
    act(() => {
      apiMock.setPatInputConnected(false);
    });
    await advanceTimersAndPromises(
      INTERNAL_HARDWARE_POLLING_INTERVAL_MS / 1000
    );
    await vi.waitFor(() => {
      screen.getByRole('heading', { name: /Internal Connection Problem/i });
      screen.getByText(/PAT input is disconnected\./i);
    });

    // Reconnect Accessible Controller
    act(() => {
      apiMock.setPatInputConnected(true);
    });
    await advanceTimersAndPromises(
      INTERNAL_HARDWARE_POLLING_INTERVAL_MS / 1000
    );
    await vi.waitFor(() => {
      screen.getByText(insertCardScreenText);
    });
  });

  test('Displays error screen if Card Reader connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Disconnect Card Reader
    apiMock.setAuthStatusLoggedOut('no_card_reader');
    await advanceTimersAndPromises();
    await screen.findByText('Card Reader Not Detected');

    // Reconnect Card Reader
    apiMock.setAuthStatusLoggedOut();
    await advanceTimersAndPromises();
    await screen.findByText(insertCardScreenText);
  });

  test('Admin screen trumps "No Printer Detected" error', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);

    await screen.findByText('Insert Card');

    // Expect USB port status query when SetupPrinterPage renders
    apiMock.expectGetUsbPortStatus();
    // Alarm and USB auto-disable may or may not be called depending on audio settings in test context
    apiMock.mockApiClient.playSound
      .expectOptionalRepeatedCallsWith({ name: 'alarm' })
      .resolves();
    apiMock.mockApiClient.toggleUsbPorts
      .expectOptionalRepeatedCallsWith({ action: 'disable' })
      .resolves();

    // Disconnect Printer
    act(() => {
      apiMock.setPrinterStatus({ connected: false });
    });
    await advanceTimersAndPromises();
    // When polls are open but no cardless voter session is active, non-voter-facing message
    await screen.findByRole('heading', { name: 'No Printer Detected' });
    await screen.findByText('Please ask a poll worker for help.');

    // Insert election manager card
    apiMock.setAuthStatusElectionManagerLoggedIn(electionGeneralDefinition);

    // expect to see election manager screen
    await screen.findByRole('heading', { name: 'Election Manager Menu' });
  });

  test('Displays internal connection problem when Barcode Reader connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Disconnect Barcode Reader
    act(() => {
      apiMock.setBarcodeConnected(false);
    });
    await advanceTimersAndPromises(
      INTERNAL_HARDWARE_POLLING_INTERVAL_MS / 1000
    );

    // Should see Internal Connection Problem screen with barcode message
    await vi.waitFor(() => {
      screen.getByRole('heading', { name: /Internal Connection Problem/i });
      screen.getByText(/Barcode reader is disconnected\./i);
    });

    // Reconnect Barcode Reader
    act(() => {
      apiMock.setBarcodeConnected(true);
    });
    await advanceTimersAndPromises(
      INTERNAL_HARDWARE_POLLING_INTERVAL_MS / 1000
    );
    await screen.findByText(insertCardScreenText);
  });

  test('Displays internal connection problem when Accessible Controller connection is lost', async () => {
    apiMock.expectGetMachineConfig();
    apiMock.expectGetElectionRecord(electionGeneralDefinition);
    apiMock.expectGetElectionState({
      precinctSelection: ALL_PRECINCTS_SELECTION,
      pollsState: 'polls_open',
    });

    render(<App apiClient={apiMock.mockApiClient} />);

    // Start on Insert Card screen
    await screen.findByText(insertCardScreenText);

    // Disconnect Accessible Controller
    act(() => {
      apiMock.setAccessibleControllerConnected(false);
    });
    await advanceTimersAndPromises(
      INTERNAL_HARDWARE_POLLING_INTERVAL_MS / 1000
    );

    // Should see Internal Connection Problem screen with accessible controller message
    await vi.waitFor(() => {
      screen.getByRole('heading', { name: /Internal Connection Problem/i });
      screen.getByText(/Accessible controller is disconnected\./i);
    });

    // Reconnect Accessible Controller
    act(() => {
      apiMock.setAccessibleControllerConnected(true);
    });
    await advanceTimersAndPromises(
      INTERNAL_HARDWARE_POLLING_INTERVAL_MS / 1000
    );
    await screen.findByText(insertCardScreenText);
  });
});
