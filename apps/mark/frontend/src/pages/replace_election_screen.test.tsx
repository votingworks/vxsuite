import {
  electionSampleDefinition,
  primaryElectionSampleDefinition,
} from '@votingworks/fixtures';
import React from 'react';
import { screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { err, ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import {
  ReplaceElectionScreen,
  ReplaceElectionScreenProps,
} from './replace_election_screen';
import { AriaScreenReader } from '../utils/ScreenReader';
import { fakeTts } from '../../test/helpers/fake_tts';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiClientContext, createQueryClient } from '../api';

const machineElectionDefinition = electionSampleDefinition;
const { electionHash: machineElectionHash } = machineElectionDefinition;
const cardElectionDefinition = primaryElectionSampleDefinition;
const screenReader = new AriaScreenReader(fakeTts());

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Partial<ReplaceElectionScreenProps> = {}) {
  return render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <ReplaceElectionScreen
          ballotsPrintedCount={0}
          electionDefinition={machineElectionDefinition}
          machineConfig={fakeMachineConfig()}
          screenReader={screenReader}
          unconfigure={jest.fn()}
          {...props}
        />
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

test('reading election definition from card', async () => {
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: machineElectionHash })
    .resolves(ok(cardElectionDefinition));
  const unconfigure = jest.fn();

  renderScreen({ unconfigure });

  await screen.findByText(cardElectionDefinition.election.title);
  expect(unconfigure).not.toHaveBeenCalled();
});

test('unconfiguring', async () => {
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: machineElectionHash })
    .resolves(ok(cardElectionDefinition));
  const unconfigure = jest.fn();

  renderScreen({ unconfigure });

  await screen.findByText(cardElectionDefinition.election.title);
  userEvent.click(screen.getByText('Remove the Current Election and All Data'));
  expect(unconfigure).toHaveBeenCalled();
});

test('showing count of ballots printed: 0 ballots', async () => {
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: machineElectionHash })
    .resolves(ok(cardElectionDefinition));

  renderScreen();

  await screen.findByText(cardElectionDefinition.election.title);
  screen.getByText(
    'This machine has not printed any ballots for the current election.'
  );
});

test('showing count of ballots printed: >0 ballots', async () => {
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: machineElectionHash })
    .resolves(ok(cardElectionDefinition));

  renderScreen({ ballotsPrintedCount: 129 });

  await screen.findByText(cardElectionDefinition.election.title);
  expect(screen.getByText('129 ballots').parentElement?.textContent).toEqual(
    'This machine has printed 129 ballots for the current election.'
  );
});

test('error reading election definition from card', async () => {
  apiMock.mockApiClient.readElectionDefinitionFromCard
    .expectCallWith({ electionHash: machineElectionHash })
    .resolves(err(new Error('Unable to read election definition from card')));

  renderScreen();

  await screen.findByText(
    'Error reading the election definition from Election Manager card.'
  );
});
