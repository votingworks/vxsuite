import { afterEach, beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { BallotOrderInfo } from '@votingworks/design-backend';

import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../test/api_helpers';
import { generalElectionRecord } from '../test/fixtures';
import { render, screen } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { BallotOrderInfoScreen } from './ballot_order_info_screen';
import { routes } from './routes';

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
      withRoute(<BallotOrderInfoScreen />, {
        paramPath: routes.election(':electionId').tabulation.path,
        path: routes.election(electionId).tabulation.path,
      }),
      electionId
    )
  );
}

test('updating ballot order info', async () => {
  apiMock.getElection.expectCallWith({ electionId }).resolves(electionRecord);
  renderScreen();
  await screen.findByRole('heading', { name: 'Ballot Order Info' });

  const absenteeBallotCountInput = screen.getByLabelText(
    'Number of Absentee Ballots'
  );
  expect(absenteeBallotCountInput).toBeDisabled();
  expect(absenteeBallotCountInput).toHaveValue('');

  const shouldAbsenteeBallotsBeScoredForFolding = screen.getByRole('checkbox', {
    name: 'Score Absentee Ballots for Folding',
  });
  expect(shouldAbsenteeBallotsBeScoredForFolding).toBeDisabled();
  expect(shouldAbsenteeBallotsBeScoredForFolding).not.toBeChecked();

  const precinctBallotCountInput = screen.getByLabelText(
    'Number of Polling Place Ballots'
  );
  expect(precinctBallotCountInput).toBeDisabled();
  expect(precinctBallotCountInput).toHaveValue('');

  const precinctBallotColorInput = screen.getByLabelText(
    'Paper Color for Polling Place Ballots'
  );
  expect(precinctBallotColorInput).toBeDisabled();
  expect(precinctBallotColorInput).toHaveValue('');

  const deliveryRecipientNameInput = screen.getByLabelText(
    'Delivery Recipient Name'
  );
  expect(deliveryRecipientNameInput).toBeDisabled();
  expect(deliveryRecipientNameInput).toHaveValue('');

  const deliveryAddressInput = screen.getByLabelText(
    'Delivery Address, City, State, and ZIP'
  );
  expect(deliveryAddressInput).toBeDisabled();
  expect(deliveryAddressInput).toHaveValue('');

  // Populate ballot order info

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  userEvent.type(absenteeBallotCountInput, '100');
  userEvent.click(shouldAbsenteeBallotsBeScoredForFolding);
  userEvent.type(precinctBallotCountInput, '200');
  userEvent.type(precinctBallotColorInput, 'Yellow for town, white for school');
  userEvent.type(deliveryRecipientNameInput, 'Clerky Clerkson');
  userEvent.type(deliveryAddressInput, '123 Main St, Town, NH, 00000');

  let expectedBallotOrderInfo: BallotOrderInfo = {
    absenteeBallotCount: '100',
    shouldAbsenteeBallotsBeScoredForFolding: true,
    precinctBallotCount: '200',
    precinctBallotColor: 'Yellow for town, white for school',
    deliveryRecipientName: 'Clerky Clerkson',
    deliveryAddress: '123 Main St, Town, NH, 00000',
  };
  apiMock.updateBallotOrderInfo
    .expectCallWith({ electionId, ballotOrderInfo: expectedBallotOrderInfo })
    .resolves();
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...electionRecord,
    ballotOrderInfo: expectedBallotOrderInfo,
  });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Edit' });

  expect(absenteeBallotCountInput).toHaveValue('100');
  expect(shouldAbsenteeBallotsBeScoredForFolding).toBeChecked();
  expect(precinctBallotCountInput).toHaveValue('200');
  expect(precinctBallotColorInput).toHaveValue(
    'Yellow for town, white for school'
  );
  expect(deliveryRecipientNameInput).toHaveValue('Clerky Clerkson');
  expect(deliveryAddressInput).toHaveValue('123 Main St, Town, NH, 00000');

  // Clear ballot order info

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  userEvent.clear(absenteeBallotCountInput);
  userEvent.click(shouldAbsenteeBallotsBeScoredForFolding);
  userEvent.clear(precinctBallotCountInput);
  userEvent.clear(precinctBallotColorInput);
  userEvent.clear(deliveryRecipientNameInput);
  userEvent.clear(deliveryAddressInput);

  expectedBallotOrderInfo = {
    absenteeBallotCount: '',
    shouldAbsenteeBallotsBeScoredForFolding: false,
    precinctBallotCount: '',
    precinctBallotColor: '',
    deliveryRecipientName: '',
    deliveryAddress: '',
  };
  apiMock.updateBallotOrderInfo
    .expectCallWith({ electionId, ballotOrderInfo: expectedBallotOrderInfo })
    .resolves();
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...electionRecord,
    ballotOrderInfo: expectedBallotOrderInfo,
  });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Edit' });

  expect(absenteeBallotCountInput).toHaveValue('');
  expect(shouldAbsenteeBallotsBeScoredForFolding).not.toBeChecked();
  expect(precinctBallotCountInput).toHaveValue('');
  expect(precinctBallotColorInput).toHaveValue('');
  expect(deliveryRecipientNameInput).toHaveValue('');
  expect(deliveryAddressInput).toHaveValue('');

  // Begin repopulating ballot order info but cancel

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  userEvent.type(absenteeBallotCountInput, 'A');
  userEvent.click(shouldAbsenteeBallotsBeScoredForFolding);
  userEvent.type(precinctBallotCountInput, 'B');
  userEvent.type(precinctBallotColorInput, 'C');
  userEvent.type(deliveryRecipientNameInput, 'D');
  userEvent.type(deliveryAddressInput, 'E');

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(absenteeBallotCountInput).toHaveValue('');
  expect(shouldAbsenteeBallotsBeScoredForFolding).not.toBeChecked();
  expect(precinctBallotCountInput).toHaveValue('');
  expect(precinctBallotColorInput).toHaveValue('');
  expect(deliveryRecipientNameInput).toHaveValue('');
  expect(deliveryAddressInput).toHaveValue('');
});
