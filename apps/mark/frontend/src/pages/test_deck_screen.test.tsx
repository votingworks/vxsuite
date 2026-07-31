import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { deferred } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { TestDeckScreen, TestDeckScreenProps } from './test_deck_screen';

const electionDefinition = readElectionGeneralDefinition();

let apiMock: ApiMock;

function renderScreen(props: Partial<TestDeckScreenProps> = {}) {
  return render(
    provideApi(
      apiMock,
      <MemoryRouter>
        <TestDeckScreen onBackButtonPress={vi.fn()} {...props} />
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('shows a loading state while the election record loads', () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  renderScreen();

  // The query is still pending on the initial synchronous render.
  screen.getByText('Loading');
});

test('renders the title', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  renderScreen();

  await screen.findByRole('heading', { name: 'Test Decks' });
});

test('back button calls onBackButtonPress', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  const onBackButtonPress = vi.fn();
  renderScreen({ onBackButtonPress });

  userEvent.click(await screen.findByRole('button', { name: 'Back' }));
  expect(onBackButtonPress).toHaveBeenCalledTimes(1);
});

test('prints all test decks', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  renderScreen();

  apiMock.mockApiClient.printTestDeck.expectCallWith({}).resolves();
  userEvent.click(
    await screen.findByRole('button', { name: 'Print All Test Decks' })
  );
});

test('clicking the "Print Precinct Test Deck" button calls printTestDeck', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  renderScreen();

  const printPrecinctButton = await screen.findByRole('button', {
    name: 'Print Precinct Test Deck',
  });
  expect(printPrecinctButton).toBeDisabled();

  const precinct = electionDefinition.election.precincts[0];
  userEvent.click(screen.getByText('Select a precinct…'));
  userEvent.click(screen.getByText(precinct.name));

  await vi.waitFor(() => expect(printPrecinctButton).toBeEnabled());

  apiMock.mockApiClient.printTestDeck
    .expectCallWith({ precinctId: precinct.id })
    .resolves();
  userEvent.click(printPrecinctButton);
});

test('disables the print buttons while a test deck is printing', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  renderScreen();

  const printDeferred = deferred<void>();
  apiMock.mockApiClient.printTestDeck
    .expectCallWith({})
    .returns(printDeferred.promise);

  const printAllButton = await screen.findByRole('button', {
    name: 'Print All Test Decks',
  });
  userEvent.click(printAllButton);

  await vi.waitFor(() => expect(printAllButton).toBeDisabled());

  printDeferred.resolve();
  await vi.waitFor(() => expect(printAllButton).toBeEnabled());
});

test('shows a "Printing..." message and icon on the button while printing', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  renderScreen();

  const printDeferred = deferred<void>();
  apiMock.mockApiClient.printTestDeck
    .expectCallWith({})
    .returns(printDeferred.promise);

  const printAllButton = await screen.findByRole('button', {
    name: 'Print All Test Decks',
  });
  userEvent.click(printAllButton);

  const printingButton = await screen.findByRole('button', {
    name: 'Printing...',
  });
  expect(printingButton.querySelector('[data-icon="spinner"]')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Print All Test Decks' })
  ).not.toBeInTheDocument();

  printDeferred.resolve();
  await screen.findByRole('button', { name: 'Print All Test Decks' });
});

test('disables the precinct select while printing', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  renderScreen();

  const printDeferred = deferred<void>();
  apiMock.mockApiClient.printTestDeck
    .expectCallWith({})
    .returns(printDeferred.promise);

  const precinctSelect = await screen.findByLabelText('Select a precinct');
  expect(precinctSelect).toBeEnabled();

  userEvent.click(
    await screen.findByRole('button', { name: 'Print All Test Decks' })
  );

  await vi.waitFor(() => expect(precinctSelect).toBeDisabled());

  printDeferred.resolve();
  await vi.waitFor(() => expect(precinctSelect).toBeEnabled());
});

test('shows "Printing..." only on the precinct button and reverts after settling', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  renderScreen();

  const precinct = electionDefinition.election.precincts[0];
  userEvent.click(await screen.findByText('Select a precinct…'));
  userEvent.click(screen.getByText(precinct.name));

  const printPrecinctButton = await screen.findByRole('button', {
    name: 'Print Precinct Test Deck',
  });
  await vi.waitFor(() => expect(printPrecinctButton).toBeEnabled());

  const printDeferred = deferred<void>();
  apiMock.mockApiClient.printTestDeck
    .expectCallWith({ precinctId: precinct.id })
    .returns(printDeferred.promise);
  userEvent.click(printPrecinctButton);

  // Only the precinct button shows the spinner; the "all" button keeps its
  // label.
  await screen.findByRole('button', { name: 'Printing...' });
  screen.getByRole('button', { name: 'Print All Test Decks' });
  expect(
    screen.queryByRole('button', { name: 'Print Precinct Test Deck' })
  ).not.toBeInTheDocument();

  // After the mutation settles, the button reverts to its original label.
  printDeferred.resolve();
  await screen.findByRole('button', { name: 'Print Precinct Test Deck' });
  expect(
    screen.queryByRole('button', { name: 'Printing...' })
  ).not.toBeInTheDocument();
});

test('disables printing and explains why when the printer is not connected', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.setPrinterStatus({ connected: false });
  renderScreen();

  await screen.findByText(
    'No printer detected. Connect the printer to print test decks.'
  );
  expect(
    screen.getByRole('button', { name: 'Print All Test Decks' })
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Print Precinct Test Deck' })
  ).toBeDisabled();
});

test('enables printing again once the printer reconnects', async () => {
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.setPrinterStatus({ connected: false });
  renderScreen();

  const printAllButton = await screen.findByRole('button', {
    name: 'Print All Test Decks',
  });
  expect(printAllButton).toBeDisabled();

  apiMock.setPrinterStatus({ connected: true });

  await vi.waitFor(() => expect(printAllButton).toBeEnabled());
  expect(screen.queryByText(/No printer detected/)).not.toBeInTheDocument();
});

test('renders without precincts when no election is configured', async () => {
  apiMock.expectGetElectionRecord(null);
  renderScreen();

  await screen.findByRole('button', { name: 'Print All Test Decks' });
  expect(
    screen.getByRole('button', { name: 'Print Precinct Test Deck' })
  ).toBeDisabled();
});
