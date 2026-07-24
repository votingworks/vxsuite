import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import { anyPollingPlace, BallotStyleId, PrecinctId } from '@votingworks/types';
import { getMockMultiLanguageElectionDefinition } from '@votingworks/utils';
import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import { act, fireEvent, screen } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { PrintBlankBallotScreen } from './print_blank_ballot_screen';
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiProvider } from '../api_provider';

const MockBallotStyleSelect = vi.spyOn(
  pollWorkerComponents,
  'BallotStyleSelect'
);

const multiLanguageDefinition = getMockMultiLanguageElectionDefinition(
  readElectionGeneralDefinition(),
  ['en', 'es-US']
);
const multiLanguageElection = multiLanguageDefinition.election;
const englishBallotStyle = assertDefined(
  multiLanguageElection.ballotStyles.find(
    (bs) => bs.languages.length === 1 && bs.languages[0] === 'en'
  )
);
const lockedPrecinctId = assertDefined(englishBallotStyle.precincts[0]);

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();

  // Render a placeholder that exposes the `disabled` prop for assertions.
  MockBallotStyleSelect.mockImplementation((props) => (
    <div
      data-testid="ballot-style-select"
      data-disabled={String(props.disabled ?? false)}
    />
  ));
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen(lockedBallotStyle?: {
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
}) {
  return render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <PrintBlankBallotScreen
        isLiveMode={false}
        electionPackageHash="test-election-package-hash"
        electionDefinition={multiLanguageDefinition}
        election={multiLanguageElection}
        machineConfig={mockMachineConfig()}
        pollingPlaceId={anyPollingPlace(multiLanguageElection).id}
        onBackButtonPress={vi.fn()}
        lockedBallotStyle={lockedBallotStyle}
      />
    </ApiProvider>
  );
}

test('locks and disables the dropdowns when a ballot style is preset', async () => {
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: lockedPrecinctId,
      ballotStyleId: englishBallotStyle.id,
    })
    .resolves();

  renderScreen({
    precinctId: lockedPrecinctId,
    ballotStyleId: englishBallotStyle.id,
  });

  // Ballot style dropdown is disabled.
  expect(screen.getByTestId('ballot-style-select')).toHaveAttribute(
    'data-disabled',
    'true'
  );

  // Language dropdown is preset (because the selection is preset) and disabled.
  screen.getByText('Language');
  expect(screen.getByLabelText('Ballot language')).toBeDisabled();

  // The preset ballot can still be printed.
  fireEvent.click(screen.getByText('Print Ballot'));
  await screen.findByText('Printing Ballot');
  act(() => {
    vi.advanceTimersByTime(BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
  });
  await screen.findByText('Ballot Printed');
});

test('leaves the dropdowns enabled when no ballot style is preset', () => {
  renderScreen();

  expect(screen.getByTestId('ballot-style-select')).toHaveAttribute(
    'data-disabled',
    'false'
  );

  // No selection has been made, so no language dropdown is shown.
  expect(screen.queryByText('Language')).toBeNull();
});
