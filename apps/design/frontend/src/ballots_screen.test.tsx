import { assert } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { BallotPaperSize, Election } from '@votingworks/types';
import { LayoutOptions } from '@votingworks/hmpb-layout';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
} from '../test/api_helpers';
import {
  ballotStyles,
  election,
  electionId,
  electionRecord,
  precincts,
} from '../test/fixtures';
import { render, screen, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { BallotsScreen } from './ballots_screen';
import { hasSplits } from './utils';
import { routes } from './routes';

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
      withRoute(
        <BallotsScreen />,
        routes.election(':electionId').ballots.root.path,
        routes.election(electionId).ballots.root.path
      )
    )
  );
}

test('Ballot styles tab', async () => {
  apiMock.getElection.expectCallWith({ electionId }).resolves(electionRecord);
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

  assert(hasSplits(precincts[1]));
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
    [precincts[0].name, ballotStyles[0].id, 'View Ballot'],
    [precincts[1].name, '', ''],
    [precincts[1].splits[0].name, ballotStyles[0].id, 'View Ballot'],
    [precincts[1].splits[1].name, ballotStyles[1].id, 'View Ballot'],
    [precincts[2].name, ballotStyles[2].id, 'View Ballot'],
  ]);

  // TODO add tests for ballot viewer
});

test('Ballot layout tab', async () => {
  apiMock.getElection.expectCallWith({ electionId }).resolves(electionRecord);
  renderScreen();
  await screen.findByRole('heading', { name: 'Ballots' });

  apiMock.getElection.expectCallWith({ electionId }).resolves(electionRecord);
  userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));

  const [paperSizeRadioGroup, densityRadioGroup, bubblePositionControl] =
    screen.getAllByRole('radiogroup');

  // Paper size initial state
  expect(paperSizeRadioGroup.closest('label')).toHaveTextContent('Paper Size');
  const paperSizeOptions = within(paperSizeRadioGroup).getAllByRole('radio', {
    hidden: true,
  });
  for (const option of paperSizeOptions) {
    expect(option).toBeDisabled();
  }
  expect(
    paperSizeOptions.map((radio) => radio.closest('label')?.textContent)
  ).toEqual([
    '8.5 x 11 inches (Letter)',
    '8.5 x 14 inches (Legal)',
    '8.5 x 17 inches',
    '8.5 x 18 inches',
    '8.5 x 21 inches',
    '8.5 x 22 inches',
  ]);
  expect(
    within(paperSizeRadioGroup).getByLabelText('8.5 x 11 inches (Letter)')
  ).toBeChecked();

  // Density initial state
  expect(densityRadioGroup.closest('label')).toHaveTextContent('Density');
  const densityOptions = within(densityRadioGroup).getAllByRole('radio', {
    hidden: true,
  });
  for (const option of densityOptions) {
    expect(option).toBeDisabled();
  }
  expect(
    densityOptions.map((radio) => radio.closest('label')?.textContent)
  ).toEqual(['Default', 'Medium', 'Condensed']);
  expect(within(densityRadioGroup).getByLabelText('Default')).toBeChecked();

  // Bubble position initial state
  expect(bubblePositionControl.closest('label')).toHaveTextContent(
    'Bubble Position'
  );
  const bubblePositionOptions = within(bubblePositionControl).getAllByRole(
    'radio'
  );
  for (const option of bubblePositionOptions) {
    expect(option).toBeDisabled();
  }
  expect(bubblePositionOptions.map((radio) => radio.textContent)).toEqual([
    'Left',
    'Right',
  ]);
  expect(
    within(bubblePositionControl).getByRole('radio', { name: 'Left' })
  ).toBeChecked();

  // Edit
  userEvent.click(screen.getByRole('button', { name: /Edit/ }));

  userEvent.click(screen.getByLabelText('8.5 x 17 inches'));
  expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();

  userEvent.click(screen.getByLabelText('Medium'));
  expect(screen.getByLabelText('Medium')).toBeChecked();

  userEvent.click(screen.getByLabelText('Right'));
  expect(screen.getByLabelText('Right')).toBeChecked();

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
    ...electionRecord,
    election: updatedElection,
    layoutOptions: updatedLayoutOptions,
  });
  // Extra refetch because of the dual mutations
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...electionRecord,
    election: updatedElection,
    layoutOptions: updatedLayoutOptions,
  });

  userEvent.click(screen.getByRole('button', { name: /Save/ }));
  await screen.findByRole('button', { name: /Edit/ });

  expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();
  expect(screen.getByLabelText('Medium')).toBeChecked();
  expect(screen.getByLabelText('Right')).toBeChecked();
});
