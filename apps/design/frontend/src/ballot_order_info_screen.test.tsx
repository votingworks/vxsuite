import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { BallotOrderInfo } from '@votingworks/design-backend';

import {
  createMockApiClient,
  MockApiClient,
  mockUserFeatures,
  user,
  provideApi,
} from '../test/api_helpers';
import { generalElectionRecord } from '../test/fixtures';
import { render, screen } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { BallotOrderInfoScreen } from './ballot_order_info_screen';
import { routes } from './routes';

const mockDateTime = new Date('2025-01-01T00:00:00.000Z');

vi.useFakeTimers({
  shouldAdvanceTime: true,
  now: mockDateTime,
});

const electionRecord = generalElectionRecord(user.orgId);
const electionId = electionRecord.election.id;

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  mockUserFeatures(apiMock, user);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen() {
  render(
    provideApi(
      apiMock,
      withRoute(<BallotOrderInfoScreen />, {
        paramPath: routes.election(':electionId').ballotOrderInfo.path,
        path: routes.election(electionId).ballotOrderInfo.path,
      })
    )
  );
}

test('submitting ballot order', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getBallotOrderInfo.expectCallWith({ electionId }).resolves({});
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  renderScreen();
  await screen.findByRole('heading', { name: 'Order Ballots' });

  const absenteeBallotCountInput = screen.getByLabelText(
    'Number of Absentee Ballots'
  );
  expect(absenteeBallotCountInput).toHaveValue(null);

  const shouldAbsenteeBallotsBeScoredForFoldingCheckbox = screen.getByRole(
    'checkbox',
    { name: 'Score Absentee Ballots for Folding' }
  );
  expect(shouldAbsenteeBallotsBeScoredForFoldingCheckbox).not.toBeChecked();

  const precinctBallotCountInput = screen.getByLabelText(
    'Number of Polling Place Ballots'
  );
  expect(precinctBallotCountInput).toHaveValue(null);

  const ballotColorInput = screen.getByLabelText('Paper Color for Ballots');
  expect(ballotColorInput).toHaveValue('');

  const shouldCollateBallotPagesCheckbox = screen.getByRole('checkbox', {
    name: 'Collate Ballot Pages',
  });
  expect(shouldCollateBallotPagesCheckbox).not.toBeChecked();

  const deliveryRecipientNameInput = screen.getByLabelText(
    'Delivery Recipient Name'
  );
  expect(deliveryRecipientNameInput).toHaveValue('');

  const deliveryRecipientPhoneNumberInput = screen.getByLabelText(
    'Delivery Recipient Phone Number'
  );
  expect(deliveryRecipientPhoneNumberInput).toHaveValue('');

  const deliveryAddressInput = screen.getByLabelText(
    'Delivery Address, City, State, and ZIP'
  );
  expect(deliveryAddressInput).toHaveValue('');

  userEvent.type(absenteeBallotCountInput, '100');
  userEvent.click(shouldAbsenteeBallotsBeScoredForFoldingCheckbox);
  userEvent.type(precinctBallotCountInput, '200');
  userEvent.type(ballotColorInput, 'Yellow for town, white for school');
  userEvent.click(shouldCollateBallotPagesCheckbox);
  userEvent.type(deliveryRecipientNameInput, 'Clerky Clerkson');
  userEvent.type(deliveryRecipientPhoneNumberInput, '(123) 456-7890');
  userEvent.type(deliveryAddressInput, '123 Main St, Town, NH, 00000');

  const expectedBallotOrderInfo: BallotOrderInfo = {
    absenteeBallotCount: '100',
    shouldAbsenteeBallotsBeScoredForFolding: true,
    precinctBallotCount: '200',
    ballotColor: 'Yellow for town, white for school',
    shouldCollateBallotPages: true,
    deliveryRecipientName: 'Clerky Clerkson',
    deliveryRecipientPhoneNumber: '(123) 456-7890',
    deliveryAddress: '123 Main St, Town, NH, 00000',
    orderSubmittedAt: mockDateTime.toISOString(),
  };
  apiMock.updateBallotOrderInfo
    .expectCallWith({ electionId, ballotOrderInfo: expectedBallotOrderInfo })
    .resolves();
  apiMock.getBallotOrderInfo
    .expectCallWith({ electionId })
    .resolves(expectedBallotOrderInfo);
  vi.setSystemTime(mockDateTime);
  userEvent.click(screen.getByRole('button', { name: 'Submit Order' }));
  // Test cancelling the confirmation dialog first
  screen.getByRole('heading', { name: 'Confirm Submit Order' });
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(
    screen.queryByRole('heading', { name: 'Confirm Submit Order' })
  ).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Submit Order' }));
  userEvent.click(screen.getByRole('button', { name: 'Submit Order' }));
  await screen.findByRole('heading', { name: 'Order Submitted' });

  expect(absenteeBallotCountInput).toHaveValue(100);
  expect(absenteeBallotCountInput).toBeDisabled();
  expect(shouldAbsenteeBallotsBeScoredForFoldingCheckbox).toBeChecked();
  expect(shouldAbsenteeBallotsBeScoredForFoldingCheckbox).toBeDisabled();
  expect(precinctBallotCountInput).toHaveValue(200);
  expect(precinctBallotCountInput).toBeDisabled();
  expect(ballotColorInput).toHaveValue('Yellow for town, white for school');
  expect(ballotColorInput).toBeDisabled();
  expect(shouldCollateBallotPagesCheckbox).toBeChecked();
  expect(shouldCollateBallotPagesCheckbox).toBeDisabled();
  expect(deliveryRecipientNameInput).toHaveValue('Clerky Clerkson');
  expect(deliveryRecipientNameInput).toBeDisabled();
  expect(deliveryRecipientPhoneNumberInput).toHaveValue('(123) 456-7890');
  expect(deliveryRecipientPhoneNumberInput).toBeDisabled();
  expect(deliveryAddressInput).toHaveValue('123 Main St, Town, NH, 00000');
  expect(deliveryAddressInput).toBeDisabled();
});

test('submitting ballot order with validation errors', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getBallotOrderInfo.expectCallWith({ electionId }).resolves({});
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  renderScreen();
  await screen.findByRole('heading', { name: 'Order Ballots' });

  userEvent.click(screen.getByRole('button', { name: 'Submit Order' }));

  const absenteeBallotCountInput = screen.getByLabelText(
    'Number of Absentee Ballots'
  );
  expect(absenteeBallotCountInput).toBeInvalid();
  expect(absenteeBallotCountInput).toHaveValue(null);

  const precinctBallotCountInput = screen.getByLabelText(
    'Number of Polling Place Ballots'
  );
  expect(precinctBallotCountInput).toBeInvalid();
  expect(precinctBallotCountInput).toHaveValue(null);

  const deliveryRecipientNameInput = screen.getByLabelText(
    'Delivery Recipient Name'
  );
  expect(deliveryRecipientNameInput).toBeInvalid();
  expect(deliveryRecipientNameInput).toHaveValue('');

  userEvent.type(deliveryRecipientNameInput, '       ');
  userEvent.click(screen.getByRole('button', { name: 'Submit Order' }));

  expect(deliveryRecipientNameInput).toBeInvalid();
  expect(deliveryRecipientNameInput).toHaveValue('');
});

test('ballot order submission required ballots to be proofed first', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getBallotOrderInfo.expectCallWith({ electionId }).resolves({});
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  renderScreen();
  await screen.findByRole('heading', { name: 'Order Ballots' });

  screen.getByRole('heading', { name: 'Ballots are Not Finalized' });
  expect(screen.getByRole('button', { name: 'Submit Order' })).toBeDisabled();
});
