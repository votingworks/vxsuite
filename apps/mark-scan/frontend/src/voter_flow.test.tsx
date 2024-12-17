import { mockOf } from '@votingworks/test-utils';
import {
  MarkScanControllerSandbox,
  useIsPatDeviceConnected,
} from '@votingworks/ui';
import React from 'react';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import type { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import { act, render, screen } from '../test/react_testing_library';
import { VoterFlow, VoterFlowProps } from './voter_flow';
import { mockMachineConfig } from '../test/helpers/mock_machine_config';
import { Ballot } from './components/ballot';
import { PatDeviceCalibrationPage } from './pages/pat_device_identification/pat_device_calibration_page';
import { createApiMock } from '../test/helpers/mock_api_client';
import { ApiProvider } from './api_provider';

const electionGeneralDefinition = readElectionGeneralDefinition();

let setMockControllerHelpTriggered:
  | ((shouldShowHelp: boolean) => void)
  | undefined;

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),

  MarkScanControllerSandbox: jest.fn(),

  useAccessibleControllerHelpTrigger: () => {
    const [shouldShowControllerSandbox, setShouldShowControllerSandbox] =
      React.useState(false);
    setMockControllerHelpTriggered = setShouldShowControllerSandbox;

    return { shouldShowControllerSandbox };
  },
}));

jest.mock('./components/ballot', (): typeof import('./components/ballot') => ({
  ...jest.requireActual('./components/ballot'),
  Ballot: jest.fn(),
}));

jest.mock('./pages/pat_device_identification/pat_device_calibration_page');

const MOCK_INVALID_BALLOT_SCREEN_CONTENTS = 'MockInvalidBallotScreen';
jest.mock(
  './pages/reinserted_invalid_ballot_screen',
  (): typeof import('./pages/reinserted_invalid_ballot_screen') => ({
    ...jest.requireActual('./pages/reinserted_invalid_ballot_screen'),
    ReinsertedInvalidBallotScreen: () => (
      <div>{MOCK_INVALID_BALLOT_SCREEN_CONTENTS}</div>
    ),
  })
);

const MOCK_WAITING_FOR_REINSERTION_SCREEN_CONTENTS =
  'MockWaitingForReinsertionScreen';
jest.mock(
  './pages/waiting_for_ballot_reinsertion_screen',
  (): typeof import('./pages/waiting_for_ballot_reinsertion_screen') => ({
    ...jest.requireActual('./pages/waiting_for_ballot_reinsertion_screen'),
    WaitingForBallotReinsertionBallotScreen: () => (
      <div>{MOCK_WAITING_FOR_REINSERTION_SCREEN_CONTENTS}</div>
    ),
  })
);

const mockApi = createApiMock();

function TestContext(props: React.PropsWithChildren) {
  const { children } = props;

  return (
    <ApiProvider apiClient={mockApi.mockApiClient}>{children}</ApiProvider>
  );
}

const electionDefinition = electionGeneralDefinition;
const { contests } = electionDefinition.election;

const TEST_VOTER_FLOW_PROPS: VoterFlowProps = {
  contests,
  electionDefinition,
  endVoterSession: jest.fn(),
  isLiveMode: true,
  machineConfig: mockMachineConfig(),
  resetBallot: jest.fn(),
  stateMachineState: 'waiting_for_ballot_data',
  updateVote: jest.fn(),
  votes: {},
};

beforeEach(() => {
  mockApi.mockApiClient.getIsPatDeviceConnected.mockReturnValue(false);
});

test('replaces screen with accessible controller sandbox when triggered', () => {
  mockOf(Ballot).mockReturnValue(<div data-testid="mockBallotScreen" />);
  mockOf(MarkScanControllerSandbox).mockReturnValue(
    <div data-testid="mockControllerSandbox" />
  );

  render(
    <TestContext>
      <VoterFlow {...TEST_VOTER_FLOW_PROPS} />
    </TestContext>
  );

  screen.getByTestId('mockBallotScreen');
  expect(screen.queryByTestId('mockControllerSandbox')).not.toBeInTheDocument();

  act(() => setMockControllerHelpTriggered!(true));
  screen.getByTestId('mockControllerSandbox');
  expect(screen.queryByTestId('mockBallotScreen')).not.toBeInTheDocument();
});

test('replaces screen with PAT device calibration when connected', () => {
  mockOf(Ballot).mockReturnValue(<div data-testid="mockBallotScreen" />);
  mockOf(PatDeviceCalibrationPage).mockReturnValue(
    <div data-testid="mockPatCalibrationScreen" />
  );

  const { rerender } = render(
    <TestContext>
      <VoterFlow {...TEST_VOTER_FLOW_PROPS} />
    </TestContext>
  );

  screen.getByTestId('mockBallotScreen');
  expect(
    screen.queryByTestId('mockPatCalibrationScreen')
  ).not.toBeInTheDocument();

  // Re-render with `pat_device_connected` state machine state:
  rerender(
    <TestContext>
      <VoterFlow
        {...{
          ...TEST_VOTER_FLOW_PROPS,
          stateMachineState: 'pat_device_connected', //
        }}
      />
    </TestContext>
  );
  screen.getByTestId('mockPatCalibrationScreen');
  expect(screen.queryByTestId('mockBallotScreen')).not.toBeInTheDocument();
});

test('sets up the PatDeviceContextProvider', async () => {
  mockApi.mockApiClient.getIsPatDeviceConnected.mockReturnValue(true);

  mockOf(Ballot).mockImplementation(() => {
    const isPatDeviceConnected = useIsPatDeviceConnected();

    return <div>PAT Device Connected: {isPatDeviceConnected.toString()}</div>;
  });

  render(
    <TestContext>
      <VoterFlow {...TEST_VOTER_FLOW_PROPS} />
    </TestContext>
  );

  await screen.findByText('PAT Device Connected: true');
});

describe('ballot removal/re-insertion', () => {
  const ballotReinsertionStateScreenContents: Partial<
    Record<SimpleServerStatus, string | RegExp>
  > = {
    waiting_for_ballot_reinsertion:
      MOCK_WAITING_FOR_REINSERTION_SCREEN_CONTENTS,
    loading_reinserted_ballot: /loading your ballot/i,
    validating_reinserted_ballot: /loading your ballot/i,
    reinserted_invalid_ballot: MOCK_INVALID_BALLOT_SCREEN_CONTENTS,
  };

  for (const [stateMachineState, expectedString] of Object.entries(
    ballotReinsertionStateScreenContents
  ) as Array<[SimpleServerStatus, string | RegExp]>) {
    test(`ballot re-insertion state: ${stateMachineState}`, async () => {
      render(
        <TestContext>
          <VoterFlow
            {...{
              ...TEST_VOTER_FLOW_PROPS,
              stateMachineState,
            }}
          />
        </TestContext>
      );

      await screen.findByText(expectedString);
    });
  }
});
