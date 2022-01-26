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
