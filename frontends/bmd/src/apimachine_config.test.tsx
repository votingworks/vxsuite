import React from 'react';
import { render } from '@testing-library/react';

import fetchMock from 'fetch-mock';
import { Provider } from '@votingworks/types';
import { MemoryCard, MemoryStorage, typedAs } from '@votingworks/utils';
import { App } from './app';

import { MarkOnly, MachineConfigResponse, MachineConfig } from './config/types';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

test('machineConfig is fetched from /machine-config by default', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      appModeKey: MarkOnly.key,
      machineId: '99',
      codeVersion: 'test',
      screenOrientation: 'portrait',
    })
  );

  render(
    <App
      card={new MemoryCard()}
      storage={new MemoryStorage()}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  expect(fetchMock.called('/machine-config')).toBe(true);
});

test('machineConfig fetch fails', async () => {
  const machineConfig: Provider<MachineConfig> = {
    get: () => Promise.reject(new Error('fetch failed!')),
  };

  // Render app which gets machineConfig in componentDidMount
  render(
    <App
      card={new MemoryCard()}
      storage={new MemoryStorage()}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `catch` block of `setMachineConfig`
});

test('machineId is empty', async () => {
  const machineConfig: Provider<MachineConfig> = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async get() {
      return {
        appMode: MarkOnly,
        machineId: '',
        codeVersion: 'test',
        screenOrientation: 'portrait',
      };
    },
  };

  // Render app which gets machineConfig in componentDidMount
  render(
    <App
      card={new MemoryCard()}
      storage={new MemoryStorage()}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `else` block of `setMachineConfig`
});

test('machineConfig is empty', async () => {
  const machineConfig: Provider<MachineConfig> = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async get(): Promise<MachineConfig> {
      // @ts-expect-error - we're mocking an API failure
      return undefined;
    },
  };

  // Render app which gets machineConfig in componentDidMount
  render(
    <App
      card={new MemoryCard()}
      storage={new MemoryStorage()}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `else` block of `setMachineConfig`
});
