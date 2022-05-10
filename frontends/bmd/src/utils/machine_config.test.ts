import fetchMock from 'fetch-mock';
import { typedAs } from '@votingworks/utils';
import { machineConfigProvider } from './machine_config';
import {
  MachineConfig,
  MachineConfigResponse,
  MarkOnly,
  MarkAndPrint,
  PrintOnly,
} from '../config/types';

test('successful MarkOnly fetch from /machine-config', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      appModeKey: 'MarkOnly',
      machineId: '1',
      codeVersion: 'test',
    })
  );
  expect(await machineConfigProvider.get()).toEqual(
    typedAs<MachineConfig>({
      appMode: MarkOnly,
      machineId: '1',
      codeVersion: 'test',
    })
  );
});

test('successful PrintOnly fetch from /machine-config', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      appModeKey: 'PrintOnly',
      machineId: '1',
      codeVersion: 'test',
    })
  );
  expect(await machineConfigProvider.get()).toEqual(
    typedAs<MachineConfig>({
      appMode: PrintOnly,
      machineId: '1',
      codeVersion: 'test',
    })
  );
});

test('successful MarkAndPrint fetch from /machine-config', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      appModeKey: 'MarkAndPrint',
      machineId: '1',
      codeVersion: 'test',
    })
  );
  expect(await machineConfigProvider.get()).toEqual(
    typedAs<MachineConfig>({
      appMode: MarkAndPrint,
      machineId: '1',
      codeVersion: 'test',
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
        appModeKey: 'PrintOnly',
        machineId: '1',
        codeVersion: 'test',
      })
    );

    expect(await machineConfigProvider.get()).toEqual(
      typedAs<MachineConfig>({
        appMode: MarkOnly,
        machineId: '2',
        codeVersion: 'test-override',
      })
    );
  } finally {
    process.env = originalProcessEnv;
  }
});

test('overrides without appMode', async () => {
  const originalProcessEnv = process.env;

  process.env = {
    ...process.env,
    NODE_ENV: 'development',
    REACT_APP_VX_MACHINE_ID: '2',
    REACT_APP_VX_CODE_VERSION: 'test-override',
  };

  try {
    fetchMock.get(
      '/machine-config',
      typedAs<MachineConfigResponse>({
        appModeKey: 'PrintOnly',
        machineId: '1',
        codeVersion: 'test',
      })
    );

    expect(await machineConfigProvider.get()).toEqual(
      typedAs<MachineConfig>({
        appMode: PrintOnly,
        machineId: '2',
        codeVersion: 'test-override',
      })
    );
  } finally {
    process.env = originalProcessEnv;
  }
});
