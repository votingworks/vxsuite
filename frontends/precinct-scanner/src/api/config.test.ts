import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { Scan } from '@votingworks/api';
import fetchMock from 'fetch-mock';
import { Buffer } from 'buffer';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import * as config from './config';

test('GET /config/election', async () => {
  fetchMock.getOnce(
    '/precinct-scanner/config/election',
    testElectionDefinition
  );
  expect(await config.getElectionDefinition()).toEqual(testElectionDefinition);
});

test('PATCH /config/election', async () => {
  fetchMock.patchOnce(
    '/precinct-scanner/config/election',
    JSON.stringify({ status: 'ok' })
  );
  await config.setElection(testElectionDefinition.electionData);
});

test('PATCH /config/election fails', async () => {
  const body: Scan.PatchElectionConfigResponse = {
    status: 'error',
    errors: [{ type: 'invalid-value', message: 'bad election!' }],
  };
  fetchMock.patchOnce('/precinct-scanner/config/election', {
    status: 400,
    body,
  });
  await expect(
    config.setElection(testElectionDefinition.electionData)
  ).rejects.toThrowError('bad election!');
});

test('DELETE /config/election to delete election', async () => {
  fetchMock.deleteOnce(
    '/precinct-scanner/config/election',
    JSON.stringify({ status: 'ok' })
  );
  await config.setElection(undefined);
});

test('DELETE /config/election ?ignoreBackupRequirement query param', async () => {
  fetchMock.deleteOnce(
    '/precinct-scanner/config/election?ignoreBackupRequirement=true',
    JSON.stringify({ status: 'ok' })
  );
  await config.setElection(undefined, { ignoreBackupRequirement: true });
});

test('DELETE /config/election to delete election with bad API response', async () => {
  fetchMock.deleteOnce(
    '/precinct-scanner/config/election',
    JSON.stringify({ status: 'not-ok' })
  );
  await expect(config.setElection(undefined)).rejects.toThrow(/DELETE/);
});

test('GET /config/testMode', async () => {
  const testModeTrueResponse: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  };
  const testModeFalseResponse: Scan.GetTestModeConfigResponse = {
    status: 'ok',
    testMode: false,
  };
  fetchMock.getOnce('/precinct-scanner/config/testMode', {
    body: testModeTrueResponse,
  });
  expect(await config.getTestMode()).toEqual(true);

  fetchMock.getOnce(
    '/precinct-scanner/config/testMode',
    testModeFalseResponse,
    {
      overwriteRoutes: true,
    }
  );
  expect(await config.getTestMode()).toEqual(false);
});

test('PATCH /config/testMode', async () => {
  fetchMock.patchOnce(
    '/precinct-scanner/config/testMode',
    JSON.stringify({ status: 'ok' })
  );
  await config.setTestMode(true);

  expect(
    fetchMock.calls('/precinct-scanner/config/testMode', { method: 'PATCH' })
  ).toHaveLength(1);
});

test('setPrecinctSelection updates', async () => {
  fetchMock.putOnce(
    '/precinct-scanner/config/precinct',
    JSON.stringify({ status: 'ok' })
  );
  await config.setPrecinctSelection(singlePrecinctSelectionFor('23'));

  expect(
    fetchMock.calls('/precinct-scanner/config/precinct', { method: 'PUT' })
  ).toHaveLength(1);
});

test('setPrecinctSelection fails', async () => {
  fetchMock.putOnce(
    '/precinct-scanner/config/precinct',
    JSON.stringify({ status: 'error' })
  );
  await expect(
    config.setPrecinctSelection(singlePrecinctSelectionFor('23'))
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    '"PUT /precinct-scanner/config/precinct failed: undefined"'
  );
});

test('PATCH setMarkThresholds', async () => {
  fetchMock.patchOnce('/precinct-scanner/config/markThresholdOverrides', {
    body: { status: 'ok' },
  });
  await config.setMarkThresholdOverrides({ definite: 0.25, marginal: 0.5 });

  expect(
    fetchMock.calls('/precinct-scanner/config/markThresholdOverrides', {
      method: 'PATCH',
    })
  ).toHaveLength(1);
});

test('setMarkThresholds deletes', async () => {
  fetchMock.deleteOnce('/precinct-scanner/config/markThresholdOverrides', {
    body: { status: 'ok' },
  });
  await config.setMarkThresholdOverrides(undefined);

  expect(
    fetchMock.calls('/precinct-scanner/config/markThresholdOverrides', {
      method: 'DELETE',
    })
  ).toHaveLength(1);
});

test('addTemplates configures the server with the contained election', async () => {
  fetchMock.patchOnce('/precinct-scanner/config/election', {
    body: { status: 'ok' },
  });

  await new Promise<void>((resolve, reject) => {
    config
      .addTemplates({ electionDefinition: testElectionDefinition, ballots: [] })
      .on('error', (error) => {
        reject(error);
      })
      .on('completed', () => {
        resolve();
      });
  });
});

test('addTemplates emits an event each time a ballot begins uploading', async () => {
  fetchMock.patchOnce('/precinct-scanner/config/election', {
    body: { status: 'ok' },
  });
  fetchMock.post('/precinct-scanner/config/addTemplates', {
    body: { status: 'ok' },
  });

  const uploading = jest.fn();

  await new Promise<void>((resolve, reject) => {
    config
      .addTemplates({
        electionDefinition: testElectionDefinition,
        ballots: [
          {
            ballotConfig: {
              ballotStyleId: '5',
              precinctId: '21',
              isLiveMode: true,
              isAbsentee: false,
              contestIds: ['a', 'b', 'c'],
              filename: 'ballot-1.pdf',
              locales: { primary: 'en-US' },
              layoutFilename: 'layout-1.json',
            },
            pdf: Buffer.of(),
            layout: [],
          },
          {
            ballotConfig: {
              ballotStyleId: '5',
              precinctId: '21',
              isLiveMode: false,
              isAbsentee: false,
              contestIds: ['a', 'b', 'c'],
              filename: 'ballot-1-test.pdf',
              locales: { primary: 'en-US' },
              layoutFilename: 'layout-1.json',
            },
            pdf: Buffer.of(),
            layout: [],
          },
        ],
      })
      .on('error', (error) => {
        reject(error);
      })
      .on('uploading', uploading)
      .on('completed', () => {
        resolve();
      });
  });

  expect(
    fetchMock.calls('/precinct-scanner/config/addTemplates').length
  ).toEqual(2);
});

test('addTemplates emits error on API failure', async () => {
  const body: Scan.PatchElectionConfigResponse = {
    status: 'error',
    errors: [{ type: 'invalid-value', message: 'bad election!' }],
  };
  fetchMock.patchOnce('/precinct-scanner/config/election', {
    status: 400,
    body,
  });

  await expect(
    new Promise<void>((resolve, reject) => {
      config
        .addTemplates({
          electionDefinition: testElectionDefinition,
          ballots: [],
        })
        .on('error', (error) => {
          reject(error);
        })
        .on('completed', () => {
          resolve();
        });
    })
  ).rejects.toThrowError();
});
