import {
  AdjudicationReason,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
} from '@votingworks/types';
import { ElectionRecord } from '@votingworks/design-backend';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
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

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionId = 'election-id-1';
const { election } = electionFamousNames2021Fixtures;
const electionRecord: ElectionRecord = {
  id: electionId,
  election,
  systemSettings: DEFAULT_SYSTEM_SETTINGS,
  // TODO more realistic data for precincts and ballot styles in tests in
  // general, even though they are not used here
  precincts: [],
  ballotStyles: [],
  createdAt: new Date().toISOString(),
};

function renderScreen() {
  render(
    provideApi(
      apiMock,
      withRoute(
        <TabulationScreen />,
        routes.election(':electionId').export.path,
        routes.election(electionId).export.path
      )
    )
  );
}

test('mark thresholds', async () => {
  apiMock.getElection
    .expectCallWith({
      electionId,
    })
    .resolves(electionRecord);
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
      definite: 0.259,
      marginal: 0.178,
    },
  };
  apiMock.updateSystemSettings
    .expectCallWith({
      electionId,
      systemSettings: updatedSystemSettings,
    })
    .resolves();
  apiMock.getElection
    .expectCallWith({
      electionId,
    })
    .resolves({
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
  apiMock.getElection
    .expectCallWith({
      electionId,
    })
    .resolves(electionRecord);
  renderScreen();
  await screen.findByRole('heading', { name: 'Tabulation' });

  for (const option of screen.getAllByRole('option')) {
    expect(
      within(option).getByRole('checkbox', { hidden: true })
    ).toBeDisabled();
  }

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  screen.getByRole('heading', { name: 'Adjudication Reasons' });
  for (const machine of ['VxScan', 'VxCentralScan']) {
    const container = screen.getByText(machine).closest('label')!;
    const select = within(container).getByRole('listbox');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(4);
    for (const option of options) {
      expect(
        within(option).getByRole('checkbox', { hidden: true })
      ).not.toBeChecked();
    }
    expect(options[0]).toHaveTextContent('Overvote');
    expect(options[1]).toHaveTextContent('Undervote');
    expect(options[2]).toHaveTextContent('Marginal Mark');
    expect(options[3]).toHaveTextContent('Blank Ballot');

    userEvent.click(options[0]);
    expect(
      within(options[0]).getByRole('checkbox', { hidden: true })
    ).toBeChecked();
  }

  const updatedSystemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
    centralScanAdjudicationReasons: [AdjudicationReason.Overvote],
  };
  apiMock.updateSystemSettings
    .expectCallWith({
      electionId,
      systemSettings: updatedSystemSettings,
    })
    .resolves();
  apiMock.getElection
    .expectCallWith({
      electionId,
    })
    .resolves({
      ...electionRecord,
      systemSettings: updatedSystemSettings,
    });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Edit' });

  for (const option of screen.getAllByRole('option')) {
    expect(
      within(option).getByRole('checkbox', { hidden: true })
    ).toBeDisabled();
    if (option.textContent === 'Overvote') {
      expect(
        within(option).getByRole('checkbox', { hidden: true })
      ).toBeChecked();
    } else {
      expect(
        within(option).getByRole('checkbox', { hidden: true })
      ).not.toBeChecked();
    }
  }
});
