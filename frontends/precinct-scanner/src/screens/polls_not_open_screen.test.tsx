import React from 'react';
import { render, screen } from '@testing-library/react';
import { Inserted } from '@votingworks/test-utils';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { AppContext } from '../contexts/app_context';
import {
  PollsNotOpenScreen,
  PollsNotOpenScreenProps,
} from './polls_not_open_screen';

const TEST_BALLOT_COUNT = 50;
const MACHINE_ID = '0003';

function renderScreen(props: Partial<PollsNotOpenScreenProps> = {}) {
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
      <PollsNotOpenScreen
        showNoChargerWarning={false}
        isLiveMode
        pollsState="polls_closed_initial"
        scannedBallotCount={TEST_BALLOT_COUNT}
        {...props}
      />
    </AppContext.Provider>
  );
}

describe('PollsNotOpenScreen', () => {
  test('shows correct state on initial polls closed', async () => {
    renderScreen();
    await screen.findByText('Polls Closed');
    screen.getByText('Insert a poll worker card to open polls.');
  });

  test('shows correct state on polls paused', async () => {
    renderScreen({ pollsState: 'polls_paused' });
    await screen.findByText('Polls Paused');
    screen.getByText('Insert a poll worker card to open polls.');
  });

  test('shows correct state on final polls closed', async () => {
    renderScreen({ pollsState: 'polls_closed_final' });
    await screen.findByText('Polls Closed');
    screen.getByText('Voting is complete.');
    expect(
      screen.queryByText('Insert a poll worker card to open polls.')
    ).not.toBeInTheDocument();
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
    await screen.findByText('Franklin County,');
    await screen.findByText('State of Hamilton');
    screen.getByText('Center Springfield,');
    screen.getByText(MACHINE_ID);
  });
});
