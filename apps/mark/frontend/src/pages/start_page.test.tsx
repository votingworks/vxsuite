import React from 'react';
import { Route } from 'react-router-dom';
import {
  primaryElectionSampleDefinition,
  electionSampleNoSealDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen } from '../../test/react_testing_library';
import { fakeMachineConfig } from '../../test/helpers/fake_machine_config';
import { render } from '../../test/test_utils';
import { StartPage } from './start_page';
import { Paths } from '../config/globals';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiClientContext, createQueryClient } from '../api';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(props: Parameters<typeof render>[1] = {}) {
  apiMock.expectGetElectionDefinition(
    props.electionDefinition ?? primaryElectionSampleDefinition
  );
  return render(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        <Route path="/" component={StartPage} />
      </QueryClientProvider>
    </ApiClientContext.Provider>,
    props
  );
}

test('renders StartPage', async () => {
  const electionDefinition = primaryElectionSampleDefinition;
  const { container } = renderScreen({
    ballotStyleId: '12D',
    electionDefinition,
    precinctId: '23',
    route: '/',
  });
  expect(
    await screen.findByText('Democratic Primary Election')
  ).toBeInTheDocument();
  screen.getByText(/(12D)/);
  expect(container.firstChild).toMatchSnapshot();
});

test('renders StartPage in Landscape Orientation', async () => {
  const electionDefinition = primaryElectionSampleDefinition;
  renderScreen({
    ballotStyleId: '12D',
    electionDefinition,
    precinctId: '23',
    route: '/',
    machineConfig: fakeMachineConfig({ screenOrientation: 'landscape' }),
  });
  expect(
    (await screen.findByText('21 contests')).parentNode?.textContent
  ).toEqual('Your ballot has 21 contests.');
});

test('renders StartPage with inline SVG', async () => {
  const electionDefinition = electionSampleDefinition;
  const { container } = renderScreen({
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(
    await screen.findByText(electionSampleDefinition.election.title)
  ).toBeInTheDocument();
  expect(container.firstChild).toMatchSnapshot();
});

test('renders StartPage with no seal', async () => {
  const electionDefinition = electionSampleNoSealDefinition;
  const { container } = renderScreen({
    electionDefinition,
    ballotStyleId: '12',
    precinctId: '23',
    route: '/',
  });
  expect(
    await screen.findByText(electionSampleDefinition.election.title)
  ).toBeInTheDocument();
  expect(container.firstChild).toMatchSnapshot();
});

it('renders display settings button', async () => {
  const electionDefinition = electionSampleDefinition;
  const history = createMemoryHistory({ initialEntries: ['/'] });

  renderScreen({
    ballotStyleId: '12',
    electionDefinition,
    history,
    precinctId: '23',
    route: '/',
  });

  expect(
    await screen.findByText(electionSampleDefinition.election.title)
  ).toBeInTheDocument();
  expect(history.location.pathname).toEqual('/');

  userEvent.click(screen.getButton(/color.+size/i));
  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
