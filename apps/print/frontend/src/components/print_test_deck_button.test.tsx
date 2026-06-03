import { afterEach, beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import {
  ApiMockProvider,
  createApiMock,
  ApiMock,
} from '../../test/mock_api_client';
import { PrintTestDeckButton } from './print_test_deck_button';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderButton(disabled = false) {
  return render(
    <ApiMockProvider apiMock={apiMock}>
      <PrintTestDeckButton disabled={disabled} />
    </ApiMockProvider>
  );
}

test('renders the Print Test Deck button', () => {
  renderButton();

  expect(
    screen.getByRole('button', { name: /Print Test Deck/i })
  ).toBeInTheDocument();
});

test('opens a confirm modal with ballot count when clicked', async () => {
  apiMock.getTestDeckBallotCount.expectCallWith().resolves(7);

  renderButton();

  userEvent.click(screen.getByRole('button', { name: /Print Test Deck/i }));

  expect(
    await screen.findByText(/Print 7 test deck ballots/)
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Print 7 Ballots/i })
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
});

test('calls printTestDeck mutation when Print button is clicked', async () => {
  apiMock.getTestDeckBallotCount.expectCallWith().resolves(3);
  apiMock.printTestDeck.expectCallWith().resolves();

  renderButton();

  userEvent.click(screen.getByRole('button', { name: /Print Test Deck/i }));
  await screen.findByText(/Print 3 test deck ballots/);
  userEvent.click(screen.getByRole('button', { name: /Print 3 Ballots/i }));

  await screen.findByText('Printing');
});

test('is disabled when disabled prop is true', () => {
  renderButton(true);

  expect(
    screen.getByRole('button', { name: /Print Test Deck/i })
  ).toBeDisabled();
});

test('Cancel button closes the modal', async () => {
  apiMock.getTestDeckBallotCount.expectCallWith().resolves(4);

  renderButton();

  userEvent.click(screen.getByRole('button', { name: /Print Test Deck/i }));
  await screen.findByText(/Print 4 test deck ballots/);

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(
    screen.queryByText(/Print 4 test deck ballots/)
  ).not.toBeInTheDocument();
});
