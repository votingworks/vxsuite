import fetchMock from 'fetch-mock';
import { typedAs } from '@votingworks/utils';
import { machineConfigProvider } from './machineConfig';
import {
  MachineConfig,
  MachineConfigResponse,
  VxMarkOnly,
  VxMarkPlusVxPrint,
  VxPrintOnly,
} from '../config/types';

test('successful VxMark fetch from /machine-config', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      appModeName: 'VxMark',
      machineId: '1',
      codeVersion: 'test',
    })
  );
  expect(await machineConfigProvider.get()).toEqual(
    typedAs<MachineConfig>({
      appMode: VxMarkOnly,
      machineId: '1',
      codeVersion: 'test',
    })
  );
});

test('successful VxPrint fetch from /machine-config', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      appModeName: 'VxPrint',
      machineId: '1',
      codeVersion: 'test',
    })
  );
  expect(await machineConfigProvider.get()).toEqual(
    typedAs<MachineConfig>({
      appMode: VxPrintOnly,
      machineId: '1',
      codeVersion: 'test',
    })
  );
});

test('successful VxMark + VxPrint fetch from /machine-config', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      appModeName: 'VxMark + VxPrint',
      machineId: '1',
      codeVersion: 'test',
    })
  );
  expect(await machineConfigProvider.get()).toEqual(
    typedAs<MachineConfig>({
      appMode: VxMarkPlusVxPrint,
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
