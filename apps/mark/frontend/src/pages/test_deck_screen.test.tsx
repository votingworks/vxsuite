import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { TestDeckScreen, TestDeckScreenProps } from './test_deck_screen';

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
  apiMock.mockApiClient.getElectionRecord.expectCallWith().resolves(null);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('renders the title', async () => {
  renderScreen();

  await screen.findByRole('heading', { name: 'Test Decks' });
});

test('back button calls onBackButtonPress', async () => {
  const onBackButtonPress = vi.fn();
  renderScreen({ onBackButtonPress });

  userEvent.click(await screen.findByRole('button', { name: 'Back' }));
  expect(onBackButtonPress).toHaveBeenCalledTimes(1);
});
