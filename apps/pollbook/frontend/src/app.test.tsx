import { test, expect } from 'vitest';
import { createMockClient } from '@votingworks/grout-test-utils';
import type { Api } from '@votingworks/pollbook-backend';
import { render } from '../test/react_testing_library';
import { App } from './app';

// This test is a placeholder to ensure that the CI test framework is working.
// Actually useful tests should be added.
test('app', () => {
  const apiMock = createMockClient<Api>();
  const wrapper = render(<App apiClient={apiMock.mockApiClient} />);
  expect(wrapper.container.innerHTML).toEqual('');
});
