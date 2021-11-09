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
