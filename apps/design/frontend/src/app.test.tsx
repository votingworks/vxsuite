import { afterEach, beforeEach, expect, test } from 'vitest';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { ElectionId } from '@votingworks/types';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  user,
} from '../test/api_helpers';
import { render, screen } from '../test/react_testing_library';
import { App } from './app';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('API errors show an error screen', async () => {
  await suppressingConsoleOutput(async () => {
    mockUserFeatures(apiMock, user, {});
    apiMock.getAllOrgs.expectCallWith().resolves([
      {
        id: user.orgId,
        name: 'Non-Vx Org',
        displayName: 'Non-Vx Org',
      },
    ]);
    apiMock.listElections.expectCallWith({ user }).resolves([]);
    apiMock.getUser.expectCallWith().resolves(user);
    render(<App apiClient={apiMock} />);

    await screen.findByRole('heading', { name: 'Elections' });

    apiMock.createElection
      .expectCallWith({
        orgId: user.orgId,
        user,
        id: 'test-random-id-1' as ElectionId,
      })
      .throws(new Error('API error'));
    userEvent.click(screen.getByRole('button', { name: 'Create Election' }));
    userEvent.type(screen.getByRole('combobox'), 'Non-Vx Org[Enter]');
    userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await screen.findByText('Something went wrong');
    const appLink = screen.getByRole('link', { name: 'VxDesign' });
    expect(appLink).toHaveAttribute('href', '/');
  });
});
