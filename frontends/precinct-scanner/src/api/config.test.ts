import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import {
  GetTestModeConfigResponse,
  PatchElectionConfigResponse,
} from '@votingworks/types/api/services/scan';
import fetchMock from 'fetch-mock';
import * as config from './config';

test('GET /config/election', async () => {
  fetchMock.getOnce('/config/election', testElectionDefinition);
  expect(await config.getElectionDefinition()).toEqual(testElectionDefinition);
});

test('PATCH /config/election', async () => {
  fetchMock.patchOnce('/config/election', JSON.stringify({ status: 'ok' }));
  await config.setElection(testElectionDefinition.electionData);
});

test('PATCH /config/election fails', async () => {
  const body: PatchElectionConfigResponse = {
    status: 'error',
    errors: [{ type: 'invalid-value', message: 'bad election!' }],
  };
  fetchMock.patchOnce('/config/election', {
    status: 400,
    body,
  });
  await expect(
    config.setElection(testElectionDefinition.electionData)
  ).rejects.toThrowError('bad election!');
});

test('DELETE /config/election to delete election', async () => {
  fetchMock.deleteOnce('/config/election', JSON.stringify({ status: 'ok' }));
  await config.setElection(undefined);
});

test('DELETE /config/election to delete election with bad API response', async () => {
  fetchMock.deleteOnce(
    '/config/election',
    JSON.stringify({ status: 'not-ok' })
  );
  await expect(config.setElection(undefined)).rejects.toThrow(/DELETE/);
});

test('GET /config/testMode', async () => {
  const testModeTrueResponse: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const testModeFalseResponse: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: false,
  };
  fetchMock.getOnce('/config/testMode', { body: testModeTrueResponse });
  expect(await config.getTestMode()).toEqual(true);

  fetchMock.getOnce('/config/testMode', testModeFalseResponse, {
    overwriteRoutes: true,
  });
  expect(await config.getTestMode()).toEqual(false);
});

test('PATCH /config/testMode', async () => {
  fetchMock.patchOnce('/config/testMode', JSON.stringify({ status: 'ok' }));
  await config.setTestMode(true);

  expect(fetchMock.calls('/config/testMode', { method: 'PATCH' })).toHaveLength(
    1
  );
});

test('setCurrentPrecinctId updates', async () => {
  fetchMock.putOnce('/config/precinct', JSON.stringify({ status: 'ok' }));
  await config.setCurrentPrecinctId('23');

  expect(fetchMock.calls('/config/precinct', { method: 'PUT' })).toHaveLength(
    1
  );
});

test('setCurrentPrecinctId deletes', async () => {
  fetchMock.deleteOnce('/config/precinct', { body: { status: 'ok' } });
  await config.setCurrentPrecinctId(undefined);

  expect(
    fetchMock.calls('/config/precinct', { method: 'DELETE' })
  ).toHaveLength(1);
});

test('setCurrentPrecinctId fails', async () => {
  fetchMock.putOnce('/config/precinct', JSON.stringify({ status: 'error' }));
  await expect(
    config.setCurrentPrecinctId('23')
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    '"PUT /config/precinct failed: undefined"'
  );
});
