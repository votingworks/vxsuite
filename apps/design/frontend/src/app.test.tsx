import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { ElectionId } from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import { AuthErrorCode } from '@votingworks/design-backend';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  user,
} from '../test/api_helpers';
import { render, screen, waitFor } from '../test/react_testing_library';
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
    mockUserFeatures(apiMock, {});
    apiMock.getAllOrgs.expectCallWith().resolves([
      {
        id: user.orgId,
        name: 'Non-Vx Org',
      },
    ]);
    apiMock.listElections.expectCallWith().resolves([]);
    apiMock.getUser.expectCallWith().resolves(user);
    render(<App apiClient={apiMock} />);

    await screen.findByRole('heading', { name: 'Elections' });

    apiMock.createElection
      .expectCallWith({
        orgId: user.orgId,
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

test('API unauthorized errors redirect to login', async () => {
  await suppressingConsoleOutput(async () => {
    Object.defineProperty(window, 'location', { value: { replace: vi.fn() } });
    apiMock.getUser
      .expectCallWith()
      .throws({ message: typedAs<AuthErrorCode>('auth:unauthorized') });
    render(<App apiClient={apiMock} />);
    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalledWith('/auth/login');
    });
  });
});

test('API forbidden errors show a page not found error screen', async () => {
  await suppressingConsoleOutput(async () => {
    mockUserFeatures(apiMock, {});
    apiMock.getAllOrgs.expectCallWith().resolves([
      {
        id: user.orgId,
        name: 'Non-Vx Org',
      },
    ]);
    apiMock.listElections.expectCallWith().resolves([]);
    apiMock.getUser.expectCallWith().resolves(user);
    render(<App apiClient={apiMock} />);

    await screen.findByRole('heading', { name: 'Elections' });
    apiMock.createElection
      .expectCallWith({
        orgId: user.orgId,
        id: 'test-random-id-1' as ElectionId,
      })
      .throws({ message: typedAs<AuthErrorCode>('auth:forbidden') });
    userEvent.click(screen.getByRole('button', { name: 'Create Election' }));
    userEvent.type(screen.getByRole('combobox'), 'Non-Vx Org[Enter]');
    userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByText('Page not found');
  });
});
