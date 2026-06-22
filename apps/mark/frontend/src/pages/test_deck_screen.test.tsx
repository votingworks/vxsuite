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

test('renders without precincts when no election is configured', async () => {
  apiMock.expectGetElectionRecord(null);
  renderScreen();

  await screen.findByRole('button', { name: 'Print All Test Decks' });
  expect(
    screen.getByRole('button', { name: 'Print Precinct Test Deck' })
  ).toBeDisabled();
});
