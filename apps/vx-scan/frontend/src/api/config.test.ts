import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import { Buffer } from 'buffer';
import * as config from './config';
import { createApiMock } from '../../test/helpers/mock_api_client';

const apiMock = createApiMock();

test('addTemplates configures the server with the contained election', async () => {
  apiMock.expectSetElection(testElectionDefinition);

  await new Promise<void>((resolve, reject) => {
    config
      .addTemplates(apiMock.mockApiClient, {
        electionDefinition: testElectionDefinition,
        ballots: [],
      })
      .on('error', (error) => {
        reject(error);
      })
      .on('completed', () => {
        resolve();
      });
  });
});

test('addTemplates emits an event each time a ballot begins uploading', async () => {
  apiMock.expectSetElection(testElectionDefinition);
  fetchMock.post('/precinct-scanner/config/addTemplates', {
    body: { status: 'ok' },
  });

  const uploading = jest.fn();

  await new Promise<void>((resolve, reject) => {
    config
      .addTemplates(apiMock.mockApiClient, {
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
  apiMock.mockApiClient.setElection
    .expectCallWith({
      electionData: testElectionDefinition.electionData,
    })
    .throws(new Error('bad election!'));

  await expect(
    new Promise<void>((resolve, reject) => {
      config
        .addTemplates(apiMock.mockApiClient, {
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
