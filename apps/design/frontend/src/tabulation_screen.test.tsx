import {
  AdjudicationReason,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/react_testing_library';
import {
  MockApiClient,
  createMockApiClient,
  provideApi,
} from '../test/api_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { TabulationScreen } from './tabulation_screen';
import { generalElectionRecord } from '../test/fixtures';

const electionRecord = generalElectionRecord;
const electionId = electionRecord.election.id;

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen() {
  render(
    provideApi(
      apiMock,
      withRoute(<TabulationScreen />, {
        paramPath: routes.election(':electionId').tabulation.path,
        path: routes.election(electionId).tabulation.path,
      }),
      electionId
    )
  );
}

test('mark thresholds', async () => {
  apiMock.getElection.expectCallWith({ electionId }).resolves(electionRecord);
  renderScreen();
  await screen.findByRole('heading', { name: 'Tabulation' });

  screen.getByRole('heading', { name: 'Mark Thresholds' });

  const definiteInput = screen.getByRole('spinbutton', {
    name: 'Definite Mark Threshold',
  });
  expect(definiteInput).toBeDisabled();
  expect(definiteInput).toHaveValue(
    electionRecord.systemSettings.markThresholds.definite
  );

  const marginalInput = screen.getByRole('spinbutton', {
    name: 'Marginal Mark Threshold',
  });
  expect(marginalInput).toBeDisabled();
  expect(marginalInput).toHaveValue(
    electionRecord.systemSettings.markThresholds.marginal
  );

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  // Due to some weirdness with the tests, we can't clear the input before
  // typing, so we have to just append
  userEvent.type(definiteInput, '9');
  userEvent.type(marginalInput, '8');

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    markThresholds: {
      ...DEFAULT_SYSTEM_SETTINGS.markThresholds,
      definite: 0.079,
      marginal: 0.058,
    },
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...electionRecord,
    systemSettings: updatedSystemSettings,
  });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  expect(definiteInput).toHaveValue(
    updatedSystemSettings.markThresholds.definite
  );
  expect(definiteInput).toBeDisabled();
  expect(marginalInput).toHaveValue(
    updatedSystemSettings.markThresholds.marginal
  );
  expect(marginalInput).toBeDisabled();
});

test('adjudication reasons', async () => {
  apiMock.getElection.expectCallWith({ electionId }).resolves(electionRecord);
  renderScreen();
  await screen.findByRole('heading', { name: 'Tabulation' });

  for (const option of screen.getAllByRole('checkbox')) {
    expect(option).toBeDisabled();
  }

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  screen.getByRole('heading', { name: 'Adjudication Reasons' });
  for (const machine of ['VxScan', 'VxCentralScan']) {
    const select = screen.getByRole('group', { name: machine });
    const options = within(select).getAllByRole('checkbox');
    expect(options).toHaveLength(5);
    for (const option of options) {
      expect(option).not.toBeChecked();
    }
    expect(options[0]).toHaveTextContent('Overvote');
    expect(options[1]).toHaveTextContent('Undervote');
    expect(options[2]).toHaveTextContent('Marginal Mark');
    expect(options[3]).toHaveTextContent('Blank Ballot');
    expect(options[4]).toHaveTextContent('Unmarked Write-In');

    userEvent.click(options[0]);
    expect(options[0]).toBeChecked();
  }

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
    centralScanAdjudicationReasons: [AdjudicationReason.Overvote],
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...electionRecord,
    systemSettings: updatedSystemSettings,
  });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  for (const option of screen.getAllByRole('checkbox')) {
    expect(option).toBeDisabled();
    if (option.textContent === 'Overvote') {
      expect(option).toBeChecked();
    } else {
      expect(option).not.toBeChecked();
    }
  }
});

test('setting write-in text area threshold', async () => {
  apiMock.getElection.expectCallWith({ electionId }).resolves(electionRecord);
  renderScreen();
  await screen.findByRole('heading', { name: 'Tabulation' });

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  expect(screen.queryByText('Write-In Area Threshold')).not.toBeInTheDocument();

  // VxCentralScan adjudication reason triggers the write-in area threshold input
  const centralScanContainer = screen.getByRole('group', {
    name: 'VxCentralScan',
  });
  userEvent.click(
    within(centralScanContainer).getByRole('checkbox', {
      name: 'Unmarked Write-In',
    })
  );
  await screen.findByText('Write-In Area Threshold');
  userEvent.click(
    within(centralScanContainer).getByRole('checkbox', {
      name: 'Unmarked Write-In',
    })
  );
  expect(screen.queryByText('Write-In Area Threshold')).not.toBeInTheDocument();

  // VxScan adjudication reason triggers the write-in area threshold input
  const scanContainer = screen.getByRole('group', { name: 'VxScan' });
  userEvent.click(
    within(scanContainer).getByRole('checkbox', {
      name: 'Unmarked Write-In',
    })
  );

  await screen.findByText('Write-In Area Threshold');
  const thresholdInput = screen.getByRole('spinbutton', {
    name: 'Write-In Area Threshold',
  });
  expect(thresholdInput).toHaveValue(
    electionRecord.systemSettings.markThresholds.writeInTextArea
  );

  // Due to some weirdness with the tests, we can't clear the input before
  // typing, so we have to just append
  userEvent.type(thresholdInput, '8');
  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    markThresholds: {
      ...DEFAULT_SYSTEM_SETTINGS.markThresholds,
      writeInTextArea: 0.058,
    },
    precinctScanAdjudicationReasons: [AdjudicationReason.UnmarkedWriteIn],
  };
  apiMock.updateSystemSettings
    .expectCallWith({ electionId, systemSettings: updatedSystemSettings })
    .resolves();
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...electionRecord,
    systemSettings: updatedSystemSettings,
  });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  expect(thresholdInput).toHaveValue(
    updatedSystemSettings.markThresholds.writeInTextArea
  );
});
