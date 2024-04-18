import { mockOf } from '@votingworks/test-utils';
import { MarkScanControllerSandbox } from '@votingworks/ui';
import React from 'react';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { act, render, screen } from '../test/react_testing_library';
import { VoterFlow } from './voter_flow';
import { mockMachineConfig } from '../test/helpers/fake_machine_config';
import { Ballot } from './components/ballot';

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

jest.mock('./api', (): typeof import('./api') => ({
  ...jest.requireActual('./api'),
  confirmSessionEnd: { useMutation: jest.fn() },
}));

test('replaces screen with accessible controller sandbox when triggered', () => {
  mockOf(Ballot).mockReturnValue(<div data-testid="mockBallotScreen" />);
  mockOf(MarkScanControllerSandbox).mockReturnValue(
    <div data-testid="mockControllerSandbox" />
  );

  const electionDefinition = electionGeneralDefinition;
  const { contests } = electionDefinition.election;

  render(
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
  );

  screen.getByTestId('mockBallotScreen');
  expect(screen.queryByTestId('mockControllerSandbox')).not.toBeInTheDocument();

  act(() => setMockControllerHelpTriggered!(true));
  screen.getByTestId('mockControllerSandbox');
  expect(screen.queryByTestId('mockBallotScreen')).not.toBeInTheDocument();
});
