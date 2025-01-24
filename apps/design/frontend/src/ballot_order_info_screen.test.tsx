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

  const ballotColorInput = screen.getByLabelText('Paper Color for Ballots');
  expect(ballotColorInput).toBeDisabled();
  expect(ballotColorInput).toHaveValue('');

  const shouldPrintCollated = screen.getByRole('checkbox', {
    name: 'Print Collated',
  });
  expect(shouldPrintCollated).toBeDisabled();
  expect(shouldPrintCollated).not.toBeChecked();

  const deliveryRecipientNameInput = screen.getByLabelText(
    'Delivery Recipient Name'
  );
  expect(deliveryRecipientNameInput).toBeDisabled();
  expect(deliveryRecipientNameInput).toHaveValue('');

  const deliveryRecipientContactNumber = screen.getByLabelText(
    'Delivery Recipient Contact Number'
  );
  expect(deliveryRecipientContactNumber).toBeDisabled();
  expect(deliveryRecipientContactNumber).toHaveValue('');

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
  userEvent.type(ballotColorInput, 'Yellow for town, white for school');
  userEvent.click(shouldPrintCollated);
  userEvent.type(deliveryRecipientNameInput, 'Clerky Clerkson');
  userEvent.type(deliveryRecipientContactNumber, '(123) 456-7890');
  userEvent.type(deliveryAddressInput, '123 Main St, Town, NH, 00000');

  let expectedBallotOrderInfo: BallotOrderInfo = {
    absenteeBallotCount: '100',
    shouldAbsenteeBallotsBeScoredForFolding: true,
    precinctBallotCount: '200',
    ballotColor: 'Yellow for town, white for school',
    shouldPrintCollated: true,
    deliveryRecipientName: 'Clerky Clerkson',
    deliveryRecipientContactNumber: '(123) 456-7890',
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
  expect(ballotColorInput).toHaveValue('Yellow for town, white for school');
  expect(shouldPrintCollated).toBeChecked();
  expect(deliveryRecipientNameInput).toHaveValue('Clerky Clerkson');
  expect(deliveryRecipientContactNumber).toHaveValue('(123) 456-7890');
  expect(deliveryAddressInput).toHaveValue('123 Main St, Town, NH, 00000');

  // Clear ballot order info

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  userEvent.clear(absenteeBallotCountInput);
  userEvent.click(shouldAbsenteeBallotsBeScoredForFolding);
  userEvent.clear(precinctBallotCountInput);
  userEvent.clear(ballotColorInput);
  userEvent.click(shouldPrintCollated);
  userEvent.clear(deliveryRecipientNameInput);
  userEvent.clear(deliveryRecipientContactNumber);
  userEvent.clear(deliveryAddressInput);

  expectedBallotOrderInfo = {
    absenteeBallotCount: '',
    shouldAbsenteeBallotsBeScoredForFolding: false,
    precinctBallotCount: '',
    ballotColor: '',
    shouldPrintCollated: false,
    deliveryRecipientName: '',
    deliveryRecipientContactNumber: '',
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
  expect(ballotColorInput).toHaveValue('');
  expect(shouldPrintCollated).not.toBeChecked();
  expect(deliveryRecipientNameInput).toHaveValue('');
  expect(deliveryRecipientContactNumber).toHaveValue('');
  expect(deliveryAddressInput).toHaveValue('');

  // Begin repopulating ballot order info but cancel

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  userEvent.type(absenteeBallotCountInput, 'A');
  userEvent.click(shouldAbsenteeBallotsBeScoredForFolding);
  userEvent.type(precinctBallotCountInput, 'B');
  userEvent.type(ballotColorInput, 'C');
  userEvent.type(shouldPrintCollated, 'D');
  userEvent.type(deliveryRecipientNameInput, 'E');
  userEvent.type(deliveryRecipientContactNumber, 'F');
  userEvent.type(deliveryAddressInput, 'G');

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(absenteeBallotCountInput).toHaveValue('');
  expect(shouldAbsenteeBallotsBeScoredForFolding).not.toBeChecked();
  expect(precinctBallotCountInput).toHaveValue('');
  expect(ballotColorInput).toHaveValue('');
  expect(shouldPrintCollated).not.toBeChecked();
  expect(deliveryRecipientNameInput).toHaveValue('');
  expect(deliveryRecipientContactNumber).toHaveValue('');
  expect(deliveryAddressInput).toHaveValue('');
});
