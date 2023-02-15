import { primaryElectionSampleDefinition } from '@votingworks/fixtures';
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { electionDefinition } from '../../test/helpers/election';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import { ReplaceElectionScreen } from './replace_election_screen';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';

const screenReader = new AriaScreenReader(fakeTts());

test('reads election definition from card', async () => {
  const unconfigure = jest.fn();

  render(
    <ReplaceElectionScreen
      ballotsPrintedCount={0}
      electionDefinition={electionDefinition}
      machineConfig={fakeMachineConfig()}
      electionDefinitionFromCard={primaryElectionSampleDefinition}
      screenReader={screenReader}
      unconfigure={unconfigure}
    />
  );

  await waitFor(() =>
    screen.getByText(primaryElectionSampleDefinition.election.title)
  );
  expect(unconfigure).not.toHaveBeenCalled();
});

test('allows unconfiguring', async () => {
  const unconfigure = jest.fn();

  render(
    <ReplaceElectionScreen
      ballotsPrintedCount={0}
      electionDefinition={electionDefinition}
      electionDefinitionFromCard={primaryElectionSampleDefinition}
      machineConfig={fakeMachineConfig()}
      screenReader={screenReader}
      unconfigure={unconfigure}
    />
  );

  await waitFor(() =>
    screen.getByText(primaryElectionSampleDefinition.election.title)
  );
  fireEvent.click(screen.getByText('Remove the Current Election and All Data'));
  expect(unconfigure).toHaveBeenCalled();
});

test('shows count of ballots printed', async () => {
  const unconfigure = jest.fn();
  const machineConfig = fakeMachineConfig();

  const { rerender } = render(
    <ReplaceElectionScreen
      ballotsPrintedCount={0}
      electionDefinition={electionDefinition}
      electionDefinitionFromCard={primaryElectionSampleDefinition}
      machineConfig={machineConfig}
      screenReader={screenReader}
      unconfigure={unconfigure}
    />
  );

  await waitFor(() =>
    screen.getByText(primaryElectionSampleDefinition.election.title)
  );
  screen.getByText(
    'This machine has not printed any ballots for the current election.'
  );

  rerender(
    <ReplaceElectionScreen
      ballotsPrintedCount={129}
      electionDefinition={electionDefinition}
      electionDefinitionFromCard={primaryElectionSampleDefinition}
      machineConfig={machineConfig}
      screenReader={screenReader}
      unconfigure={unconfigure}
    />
  );
  await waitFor(() =>
    screen.getByText(primaryElectionSampleDefinition.election.title)
  );
  expect(screen.getByText('129 ballots').parentElement?.textContent).toEqual(
    'This machine has printed 129 ballots for the current election.'
  );
});
