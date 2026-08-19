import { expect, test } from 'vitest';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { TestErrorBoundary } from '@votingworks/ui';
import { render, screen } from '../test/react_testing_library.js';
import {
  createSmartCardAuthApiClient,
  useSmartCardAuthApiClient,
} from './auth_api.js';

test('createSmartCardAuthApiClient creates a client for the auth API', () => {
  expect(createSmartCardAuthApiClient().getAuthStatus).toBeInstanceOf(Function);
});

test('useSmartCardAuthApiClient requires a provider', async () => {
  function TestComponent(): JSX.Element {
    useSmartCardAuthApiClient();
    return <div />;
  }

  await suppressingConsoleOutput(async () => {
    render(
      <TestErrorBoundary>
        <TestComponent />
      </TestErrorBoundary>
    );
    await screen.findByText(
      'Error: SmartCardAuthApiClientContext.Provider not found'
    );
  });
});
