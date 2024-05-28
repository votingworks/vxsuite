import { mockOf } from '@votingworks/test-utils';
import {
  MarkScanControllerSandbox,
  useIsPatDeviceConnected,
} from '@votingworks/ui';
import React from 'react';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { act, render, screen } from '../test/react_testing_library';
import { VoterFlow } from './voter_flow';
import { mockMachineConfig } from '../test/helpers/mock_machine_config';
import { Ballot } from './components/ballot';
import { PatDeviceCalibrationPage } from './pages/pat_device_identification/pat_device_calibration_page';
import { createApiMock } from '../test/helpers/mock_api_client';
import { ApiProvider } from './api_provider';

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

jest.mock('./api', (): typeof import('./api') => ({
  ...jest.requireActual('./api'),
  confirmSessionEnd: { useMutation: jest.fn() },
}));

const mockApi = createApiMock();

function TestContext(props: React.PropsWithChildren) {
  const { children } = props;

  return (
    <ApiProvider apiClient={mockApi.mockApiClient}>{children}</ApiProvider>
  );
}

beforeEach(() => {
  mockApi.mockApiClient.isPatDeviceConnected.mockReturnValue(false);
});

test('replaces screen with accessible controller sandbox when triggered', () => {
  mockOf(Ballot).mockReturnValue(<div data-testid="mockBallotScreen" />);
  mockOf(MarkScanControllerSandbox).mockReturnValue(
    <div data-testid="mockControllerSandbox" />
  );

  const electionDefinition = electionGeneralDefinition;
  const { contests } = electionDefinition.election;

  render(
    <TestContext>
      <VoterFlow
        {...{
          contests,
          electionDefinition,
          endVoterSession: jest.fn(),
          isLiveMode: true,
          machineConfig: mockMachineConfig(),
          resetBallot: jest.fn(),
          stateMachineState: 'waiting_for_ballot_data',
          updateVote: jest.fn(),
          votes: {},
        }}
      />
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

  const electionDefinition = electionGeneralDefinition;
  const { contests } = electionDefinition.election;

  const { rerender } = render(
    <TestContext>
      <VoterFlow
        {...{
          contests,
          electionDefinition,
          endVoterSession: jest.fn(),
          isLiveMode: true,
          machineConfig: mockMachineConfig(),
          resetBallot: jest.fn(),
          stateMachineState: 'waiting_for_ballot_data',
          updateVote: jest.fn(),
          votes: {},
        }}
      />
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
          contests,
          electionDefinition,
          endVoterSession: jest.fn(),
          isLiveMode: true,
          machineConfig: mockMachineConfig(),
          resetBallot: jest.fn(),
          stateMachineState: 'pat_device_connected', //
          updateVote: jest.fn(),
          votes: {},
        }}
      />
    </TestContext>
  );
  screen.getByTestId('mockPatCalibrationScreen');
  expect(screen.queryByTestId('mockBallotScreen')).not.toBeInTheDocument();
});

test('sets up the PatDeviceContextProvider', async () => {
  mockApi.mockApiClient.isPatDeviceConnected.mockReturnValue(true);

  mockOf(Ballot).mockImplementation(() => {
    const isPatDeviceConnected = useIsPatDeviceConnected();

    return <div>PAT Device Connected: {isPatDeviceConnected.toString()}</div>;
  });

  const electionDefinition = electionGeneralDefinition;
  const { contests } = electionDefinition.election;

  render(
    <TestContext>
      <VoterFlow
        {...{
          contests,
          electionDefinition,
          endVoterSession: jest.fn(),
          isLiveMode: true,
          machineConfig: mockMachineConfig(),
          resetBallot: jest.fn(),
          stateMachineState: 'waiting_for_ballot_data',
          updateVote: jest.fn(),
          votes: {},
        }}
      />
    </TestContext>
  );

  await screen.findByText('PAT Device Connected: true');
});
