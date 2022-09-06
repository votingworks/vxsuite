import React from 'react';
import { render, screen } from '@testing-library/react';
import { Inserted } from '@votingworks/test-utils';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { singlePrecinctSelectionFor } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';
import {
  PollsClosedScreen,
  PollsClosedScreenProps,
} from './polls_closed_screen';

const TEST_BALLOT_COUNT = 50;
const MACHINE_ID = '0003';

function renderScreen(props: Partial<PollsClosedScreenProps> = {}) {
  render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        precinctSelection: singlePrecinctSelectionFor('23'),
        currentMarkThresholds: { definite: 0.12, marginal: 0.12 },
        machineConfig: {
          machineId: MACHINE_ID,
          codeVersion: 'TEST',
        },
        auth: Inserted.fakeLoggedOutAuth(),
        isSoundMuted: false,
      }}
    >
      <PollsClosedScreen
        showNoChargerWarning={false}
        isLiveMode
        scannedBallotCount={TEST_BALLOT_COUNT}
        {...props}
      />
    </AppContext.Provider>
  );
}

describe('PollsClosedScreen', () => {
  test('shows "Polls Closed"', async () => {
    renderScreen();
    await screen.findByText('Polls Closed');
  });

  test('shows "No Power Detected" when called for', async () => {
    renderScreen({ showNoChargerWarning: true });
    await screen.findByText('No Power Detected.');
  });

  test('does not show "No Power Detected" when not called for', async () => {
    renderScreen();
    await screen.findByText('Polls Closed');
    expect(screen.queryAllByText('No Power Detected.').length).toBe(0);
  });

  test('shows ballot count', async () => {
    renderScreen();
    await screen.findByText(TEST_BALLOT_COUNT);
  });

  test('shows jurisdiction, precinct, and machine id in election info bar', async () => {
    renderScreen();
    await screen.findByText('Franklin County, State of Hamilton');
    screen.getByText('Center Springfield');
    screen.getByText(MACHINE_ID);
  });
});
