import React from 'react';
import { render } from '@testing-library/react';

import { MemoryCard, MemoryStorage } from '@votingworks/utils';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
import { createApiMock } from '../test/helpers/mock_api_client';
import { App } from './app';

const apiMock = createApiMock();

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('machineConfig is fetched from /machine-config by default', async () => {
  apiMock.expectGetMachineConfig();
  render(
    <App
      card={new MemoryCard()}
      storage={new MemoryStorage()}
      reload={jest.fn()}
      apiClient={apiMock.mockApiClient}
    />
  );
  await advanceTimersAndPromises();
});
