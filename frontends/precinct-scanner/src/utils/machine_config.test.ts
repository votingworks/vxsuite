import { typedAs } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import { MachineConfig, MachineConfigResponse } from '../config/types';
import { machineConfigProvider } from './machine_config';

test('successful fetch from /machine-config', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({ machineId: '1', codeVersion: '3.14' })
  );
  expect(await machineConfigProvider.get()).toEqual(
    typedAs<MachineConfig>({
      machineId: '1',
      codeVersion: '3.14',
    })
  );
});

test('failed fetch from /machine-config', async () => {
  fetchMock.get('/machine-config', {
    throws: new Error('fetch failed!'),
  });
  await expect(machineConfigProvider.get()).rejects.toThrowError(
    'fetch failed!'
  );
});

test('overrides', async () => {
  const originalProcessEnv = process.env;

  process.env = {
    ...process.env,
    NODE_ENV: 'development',
    REACT_APP_VX_APP_MODE: 'MarkOnly',
    REACT_APP_VX_MACHINE_ID: '2',
    REACT_APP_VX_CODE_VERSION: 'test-override',
  };

  try {
    fetchMock.get(
      '/machine-config',
      typedAs<MachineConfigResponse>({
        machineId: '1',
        codeVersion: 'test',
      })
    );

    expect(await machineConfigProvider.get()).toEqual(
      typedAs<MachineConfig>({
        machineId: '2',
        codeVersion: 'test-override',
      })
    );
  } finally {
    process.env = originalProcessEnv;
  }
});
