import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { Scan } from '@votingworks/api';
import fetchMock from 'fetch-mock';
import { Buffer } from 'buffer';
import * as config from './config';

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
