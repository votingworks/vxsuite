import userEvent from '@testing-library/user-event';
import { BallotPaperSize, Election } from '@votingworks/types';
import { LayoutOptions } from '@votingworks/hmpb-layout';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
} from '../test/api_helpers';
import {
  electionId,
  generalElectionRecord,
  primaryElectionRecord,
} from '../test/fixtures';
import { render, screen, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { BallotsScreen } from './ballots_screen';
import { routes } from './routes';

// TODO add tests for ballot viewer

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
      withRoute(<BallotsScreen />, {
        paramPath: routes.election(':electionId').ballots.root.path,
        path: routes.election(electionId).ballots.root.path,
      })
    )
  );
}

describe('Ballot styles tab', () => {
  test('General election with splits', async () => {
    apiMock.getElection
      .expectCallWith({ electionId })
      .resolves(generalElectionRecord);
    renderScreen();
    await screen.findByRole('heading', { name: 'Ballots' });

    screen.getByRole('tab', { name: 'Ballot Styles', selected: true });
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Precinct',
      'Ballot Style',
      '',
    ]);

    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent)
        )
    ).toEqual([
      ['Center Springfield', 'ballot-style-1', 'View Ballot'],
      ['North Springfield', '', ''],
      ['North Springfield - Split 1', 'ballot-style-1', 'View Ballot'],
      ['North Springfield - Split 2', 'ballot-style-2', 'View Ballot'],
    ]);
  });

  test('Primary election with splits', async () => {
    apiMock.getElection
      .expectCallWith({ electionId })
      .resolves(primaryElectionRecord);
    renderScreen();
    await screen.findByRole('heading', { name: 'Ballots' });

    screen.getByRole('tab', { name: 'Ballot Styles', selected: true });
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Precinct',
      'Ballot Style',
      'Party',
      '',
    ]);

    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent)
        )
    ).toEqual([
      ['Precinct 1', 'ballot-style-1-Ma', 'Mammal Party', 'View Ballot'],
      ['Precinct 1', 'ballot-style-1-F', 'Fish Party', 'View Ballot'],
      ['Precinct 2', 'ballot-style-1-Ma', 'Mammal Party', 'View Ballot'],
      ['Precinct 2', 'ballot-style-1-F', 'Fish Party', 'View Ballot'],
      ['Precinct 3', 'ballot-style-2-Ma', 'Mammal Party', 'View Ballot'],
      ['Precinct 3', 'ballot-style-2-F', 'Fish Party', 'View Ballot'],
      ['Precinct 4', '', '', ''],
      ['Precinct 4 - Split 1', 'ballot-style-3-Ma', 'Mammal', 'View Ballot'],
      ['Precinct 4 - Split 1', 'ballot-style-3-F', 'Fish', 'View Ballot'],
      ['Precinct 4 - Split 2', 'ballot-style-4-Ma', 'Mammal', 'View Ballot'],
      ['Precinct 4 - Split 2', 'ballot-style-4-F', 'Fish', 'View Ballot'],
    ]);
  });
});

test('Ballot layout tab', async () => {
  const { election } = generalElectionRecord;

  apiMock.getElection
    .expectCallWith({ electionId })
    .resolves(generalElectionRecord);
  renderScreen();
  await screen.findByRole('heading', { name: 'Ballots' });

  userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));

  const paperSizeRadioGroup = screen.getByRole('radiogroup', {
    name: 'Paper Size',
  });
  const densityRadioGroup = screen.getByRole('radiogroup', { name: 'Density' });
  const bubblePositionControl = screen.getByRole('listbox', {
    name: 'Bubble Position',
  });

  // Paper size initial state
  for (const optionName of [
    '8.5 x 11 inches (Letter)',
    '8.5 x 14 inches (Legal)',
    '8.5 x 17 inches',
    '8.5 x 18 inches',
    '8.5 x 21 inches',
    '8.5 x 22 inches',
  ]) {
    expect(
      within(paperSizeRadioGroup).getByRole('radio', {
        name: optionName,
      })
    ).toBeDisabled();
  }
  expect(
    within(paperSizeRadioGroup).getByLabelText('8.5 x 11 inches (Letter)')
  ).toBeChecked();

  // Density initial state
  expect(
    within(densityRadioGroup).getByRole('radio', {
      name: 'Default',
      checked: true,
    })
  ).toBeDisabled();
  expect(
    within(densityRadioGroup).getByRole('radio', {
      name: 'Medium',
      checked: false,
    })
  ).toBeDisabled();
  expect(
    within(densityRadioGroup).getByRole('radio', {
      name: 'Condensed',
      checked: false,
    })
  ).toBeDisabled();

  // Bubble position initial state
  expect(
    within(bubblePositionControl).getByRole('option', {
      name: 'Left',
      selected: true,
    })
  ).toBeDisabled();
  expect(
    within(bubblePositionControl).getByRole('option', {
      name: 'Right',
      selected: false,
    })
  ).toBeDisabled();

  // Edit
  userEvent.click(screen.getByRole('button', { name: /Edit/ }));

  userEvent.click(screen.getByLabelText('8.5 x 17 inches'));
  expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();

  userEvent.click(screen.getByLabelText('Medium'));
  expect(screen.getByLabelText('Medium')).toBeChecked();

  userEvent.click(screen.getByRole('option', { name: 'Right' }));
  screen.getByRole('option', { name: 'Right', selected: true });

  // Save
  const updatedElection: Election = {
    ...election,
    ballotLayout: {
      ...election.ballotLayout,
      paperSize: BallotPaperSize.Custom17,
    },
  };
  const updatedLayoutOptions: LayoutOptions = {
    layoutDensity: 1,
    bubblePosition: 'right',
  };
  apiMock.updateElection
    .expectCallWith({
      electionId,
      election: updatedElection,
    })
    .resolves();
  apiMock.updateLayoutOptions
    .expectCallWith({
      electionId,
      layoutOptions: updatedLayoutOptions,
    })
    .resolves();
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...generalElectionRecord,
    election: updatedElection,
    layoutOptions: updatedLayoutOptions,
  });
  // Extra refetch because of the dual mutations
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...generalElectionRecord,
    election: updatedElection,
    layoutOptions: updatedLayoutOptions,
  });

  userEvent.click(screen.getByRole('button', { name: /Save/ }));
  await screen.findByRole('button', { name: /Edit/ });

  expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();
  expect(screen.getByLabelText('Medium')).toBeChecked();
  screen.getByRole('option', { name: 'Right', selected: true });
});
