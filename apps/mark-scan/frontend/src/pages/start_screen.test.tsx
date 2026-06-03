import { afterEach, beforeEach, expect, test } from 'vitest';
import { Route } from 'react-router-dom';
import {
  readElectionGeneralDefinition,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { createMemoryHistory } from 'history';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { MARK_FLOW_UI_VOTER_SCREEN_TEST_ID } from '@votingworks/mark-flow-ui';
import {
  PageNavigationButtonId,
  PatDeviceContextProvider,
} from '@votingworks/ui';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '../../test/react_testing_library';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import { render } from '../../test/test_utils';
import { StartScreen } from './start_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;
beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders StartScreen', () => {
  apiMock.expectGetSystemSettings();
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();
  render(<Route path="/" component={StartScreen} />, {
    apiMock,
    ballotStyleId: '1M',
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
  });
  screen.getByRole('heading', { name: /Example Primary Election/ });
  screen.getByText('September 8, 2021');
  screen.getByText(
    hasTextAcrossElements('Number of contests on your ballot: 7')
  );
});

test('renders StartScreen in Landscape Orientation', () => {
  apiMock.expectGetSystemSettings();
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();
  render(<Route path="/" component={StartScreen} />, {
    apiMock,
    ballotStyleId: '1M',
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
    machineConfig: mockMachineConfig({ screenOrientation: 'landscape' }),
  });
  const heading = screen.getByRole('heading', {
    name: /Example Primary Election/,
  });
  screen.getByText('September 8, 2021');
  screen.getByText(
    hasTextAcrossElements('Number of contests on your ballot: 7')
  );
  expect(
    heading.parentElement!.parentElement!.getElementsByTagName('img')
  ).toHaveLength(1); // Seal
});

test('renders as voter screen', () => {
  apiMock.expectGetSystemSettings();
  const electionDefinition = readElectionGeneralDefinition();
  const history = createMemoryHistory({ initialEntries: ['/'] });

  render(<Route path="/" component={StartScreen} />, {
    apiMock,
    ballotStyleId: '12',
    electionDefinition,
    history,
    precinctId: '23',
    route: '/',
  });

  screen.getByTestId(MARK_FLOW_UI_VOTER_SCREEN_TEST_ID);
});

test('intro audio is replayable via the left arrow (previous) button', () => {
  apiMock.expectGetSystemSettings();
  const electionDefinition = readElectionGeneralDefinition();

  render(<Route path="/" component={StartScreen} />, {
    apiMock,
    ballotStyleId: '12',
    electionDefinition,
    precinctId: '23',
    route: '/',
  });

  // The on-load intro audio content is the click target for the accessible
  // controller's left arrow (previous) button:
  const replayTarget = document.getElementById(PageNavigationButtonId.PREVIOUS);
  expect(replayTarget).toHaveTextContent(
    /When voting with the text-to-speech audio/
  );
});

test('renders repeated audio-only intro prompt', () => {
  apiMock.expectGetSystemSettings();
  const electionDefinition = readElectionGeneralDefinition();

  render(<Route path="/" component={StartScreen} />, {
    apiMock,
    ballotStyleId: '12',
    electionDefinition,
    precinctId: '23',
    route: '/',
  });

  screen.getByText(
    'Press the left arrow button to hear voting instructions. ' +
      'Press the right arrow button to start voting. ' +
      'Press the question mark button for help with the controller.'
  );
});

test('renders PAT device-specific repeated audio-only intro prompt', () => {
  apiMock.expectGetSystemSettings();
  const electionDefinition = readElectionGeneralDefinition();

  render(
    <PatDeviceContextProvider isPatDeviceConnected>
      <Route path="/" component={StartScreen} />
    </PatDeviceContextProvider>,
    {
      apiMock,
      ballotStyleId: '12',
      electionDefinition,
      precinctId: '23',
      route: '/',
    }
  );

  screen.getByText(
    'To get started, use the move input to navigate to the control labelled ' +
      '"start voting" and then use the select input to advance to the first ' +
      'contest.'
  );
});

test('renders voter help button', async () => {
  apiMock.expectGetSystemSettings();
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();
  render(<Route path="/" component={StartScreen} />, {
    apiMock,
    ballotStyleId: '1M',
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
  });

  const voterHelpScreenHeading = 'Voter Instructions';
  userEvent.click(await screen.findByRole('button', { name: 'Help' }));
  await screen.findByRole('heading', { name: voterHelpScreenHeading });
  screen.getByRole('heading', { name: 'Start Screen' });
  userEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: voterHelpScreenHeading })
    ).not.toBeInTheDocument()
  );
});

test('does not render voter help button when system setting to disable is set', async () => {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    disableVoterHelpButtons: true,
  });
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();
  render(<Route path="/" component={StartScreen} />, {
    apiMock,
    ballotStyleId: '1M',
    electionDefinition,
    precinctId: 'precinct-1',
    route: '/',
  });

  await expect(
    screen.findByRole('button', { name: 'Help' }, { timeout: 2000 })
  ).rejects.toThrow();
});
