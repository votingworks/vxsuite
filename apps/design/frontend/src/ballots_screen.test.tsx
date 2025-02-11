import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { HmpbBallotPaperSize, Election, ElectionId } from '@votingworks/types';
import type { ElectionRecord } from '@votingworks/design-backend';
import {
  provideApi,
  createMockApiClient,
  MockApiClient,
  nonVxUser,
  vxUser,
} from '../test/api_helpers';
import { generalElectionRecord, primaryElectionRecord } from '../test/fixtures';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { BallotsScreen } from './ballots_screen';
import { routes } from './routes';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(electionId: ElectionId) {
  render(
    provideApi(
      apiMock,
      withRoute(<BallotsScreen />, {
        paramPath: routes.election(':electionId').ballots.root.path,
        path: routes.election(electionId).ballots.root.path,
      }),
      electionId
    )
  );
}

describe('Ballot styles tab', () => {
  test('General election with splits', async () => {
    const electionId = generalElectionRecord.election.id;
    apiMock.getUser.expectCallWith().resolves(nonVxUser);
    apiMock.getElection
      .expectCallWith({ user: nonVxUser, electionId })
      .resolves(generalElectionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

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
      ['Center Springfield', '1_en', 'View Ballot'],
      ['North Springfield', '', ''],
      ['North Springfield - Split 1', '1_en', 'View Ballot'],
      ['North Springfield - Split 2', '2_en', 'View Ballot'],
      ['South Springfield', 'No contests assigned', ''],
    ]);
  });

  test('Primary election with splits', async () => {
    const electionId = primaryElectionRecord.election.id;
    apiMock.getUser.expectCallWith().resolves(nonVxUser);
    apiMock.getElection
      .expectCallWith({ user: nonVxUser, electionId })
      .resolves(primaryElectionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

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
      ['Precinct 1', '1-Ma_en', 'Mammal Party', 'View Ballot'],
      ['Precinct 1', '1-F_en', 'Fish Party', 'View Ballot'],
      ['Precinct 2', '1-Ma_en', 'Mammal Party', 'View Ballot'],
      ['Precinct 2', '1-F_en', 'Fish Party', 'View Ballot'],
      ['Precinct 3', '2-Ma_en', 'Mammal Party', 'View Ballot'],
      ['Precinct 3', '2-F_en', 'Fish Party', 'View Ballot'],
      ['Precinct 4', '', '', ''],
      ['Precinct 4 - Split 1', '3-Ma_en', 'Mammal', 'View Ballot'],
      ['Precinct 4 - Split 1', '3-F_en', 'Fish', 'View Ballot'],
      ['Precinct 4 - Split 2', '4-Ma_en', 'Mammal', 'View Ballot'],
      ['Precinct 4 - Split 2', '4-F_en', 'Fish', 'View Ballot'],
    ]);
  });

  test('Precincts/splits with no ballot styles show a message', async () => {
    const electionRecord: ElectionRecord = {
      ...generalElectionRecord,
      ballotStyles: generalElectionRecord.ballotStyles.filter(
        (ballotStyle) => ballotStyle.id === '2_en'
      ),
    };
    const electionId = generalElectionRecord.election.id;
    apiMock.getUser.expectCallWith().resolves(nonVxUser);
    apiMock.getElection
      .expectCallWith({ user: nonVxUser, electionId })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    const table = screen.getByRole('table');
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
      ['Center Springfield', 'No contests assigned', ''],
      ['North Springfield', '', ''],
      ['North Springfield - Split 1', 'No contests assigned', ''],
      ['North Springfield - Split 2', '2_en', 'View Ballot'],
      ['South Springfield', 'No contests assigned', ''],
    ]);
  });

  test('Finalizing ballots', async () => {
    const electionId = generalElectionRecord.election.id;
    apiMock.getUser.expectCallWith().resolves(nonVxUser);
    apiMock.getElection
      .expectCallWith({ user: nonVxUser, electionId })
      .resolves(generalElectionRecord);
    apiMock.getBallotsFinalizedAt
      .expectOptionalRepeatedCallsWith({ electionId })
      .resolves(null);
    renderScreen(electionId);
    await screen.findByRole('heading', { name: 'Proof Ballots' });

    screen.getByRole('heading', { name: 'Ballots are Not Finalized' });

    userEvent.click(screen.getByRole('button', { name: 'Finalize Ballots' }));
    let modal = await screen.findByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Confirm Finalize Ballots' });
    userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );

    const finalizedAt = new Date();
    apiMock.finalizeBallots.expectCallWith({ electionId }).resolves();
    apiMock.getBallotsFinalizedAt
      .expectOptionalRepeatedCallsWith({ electionId })
      .resolves(finalizedAt);
    userEvent.click(screen.getByRole('button', { name: 'Finalize Ballots' }));
    modal = await screen.findByRole('alertdialog');
    userEvent.click(
      within(modal).getByRole('button', { name: 'Finalize Ballots' })
    );
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    screen.getByRole('heading', { name: 'Ballots are Finalized' });
    expect(
      screen.getByRole('button', { name: 'Finalize Ballots' })
    ).toBeDisabled();
  });
});

test('Ballot layout tab - VX User', async () => {
  const { election } = generalElectionRecord;
  const electionId = election.id;

  apiMock.getUser.expectCallWith().resolves(vxUser);
  apiMock.getElection
    .expectCallWith({ user: vxUser, electionId })
    .resolves(generalElectionRecord);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Proof Ballots' });

  userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));

  const paperSizeRadioGroup = screen.getByRole('radiogroup', {
    name: 'Paper Size',
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

  // Edit
  userEvent.click(screen.getByRole('button', { name: /Edit/ }));

  userEvent.click(screen.getByLabelText('8.5 x 17 inches'));
  expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();

  // Save
  const updatedElection: Election = {
    ...election,
    ballotLayout: {
      ...election.ballotLayout,
      paperSize: HmpbBallotPaperSize.Custom17,
    },
  };
  apiMock.updateElection
    .expectCallWith({
      electionId,
      election: updatedElection,
    })
    .resolves();
  apiMock.getElection.expectCallWith({ user: vxUser, electionId }).resolves({
    ...generalElectionRecord,
    election: updatedElection,
  });
  userEvent.click(screen.getByRole('button', { name: /Save/ }));
  await screen.findByRole('button', { name: /Edit/ });

  expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();
});

test('Ballot layout tab - NH User', async () => {
  const { election } = generalElectionRecord;
  const electionId = election.id;

  apiMock.getUser.expectCallWith().resolves(nonVxUser);
  apiMock.getElection
    .expectCallWith({ user: nonVxUser, electionId })
    .resolves(generalElectionRecord);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Proof Ballots' });

  userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));

  const paperSizeRadioGroup = screen.getByRole('radiogroup', {
    name: 'Paper Size',
  });

  // Paper size initial state
  for (const optionName of [
    '8.5 x 11 inches (Letter)',
    '8.5 x 14 inches (Legal)',
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

  // Edit
  userEvent.click(screen.getByRole('button', { name: /Edit/ }));

  userEvent.click(screen.getByLabelText('8.5 x 14 inches (Legal)'));
  expect(screen.getByLabelText('8.5 x 14 inches (Legal)')).toBeChecked();

  // Save
  const updatedElection: Election = {
    ...election,
    ballotLayout: {
      ...election.ballotLayout,
      paperSize: HmpbBallotPaperSize.Legal,
    },
  };
  apiMock.updateElection
    .expectCallWith({
      electionId,
      election: updatedElection,
    })
    .resolves();
  apiMock.getElection.expectCallWith({ user: nonVxUser, electionId }).resolves({
    ...generalElectionRecord,
    election: updatedElection,
  });
  userEvent.click(screen.getByRole('button', { name: /Save/ }));
  await screen.findByRole('button', { name: /Edit/ });

  expect(screen.getByLabelText('8.5 x 14 inches (Legal)')).toBeChecked();
});
