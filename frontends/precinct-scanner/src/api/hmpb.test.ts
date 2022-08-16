import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { Buffer } from 'buffer';
import fetchMock from 'fetch-mock';
import { addTemplates } from './hmpb';
import * as config from './config';

jest.mock('./config');
const configMock = config as jest.Mocked<typeof config>;

test('configures the server with the contained election', async () => {
  configMock.setElection.mockResolvedValueOnce();

  await new Promise<void>((resolve, reject) => {
    addTemplates({ electionDefinition, ballots: [] })
      .on('error', (error) => {
        reject(error);
      })
      .on('completed', () => {
        resolve();
      });
  });

  expect(configMock.setElection).toHaveBeenCalledWith(
    electionDefinition.electionData
  );
});

test('emits an event each time a ballot begins uploading', async () => {
  fetchMock.patchOnce('/precinct-scanner/config/election', {
    body: { status: 'ok' },
  });
  fetchMock.post('/precinct-scanner/config/addTemplates', {
    body: { status: 'ok' },
  });

  const uploading = jest.fn();

  await new Promise<void>((resolve, reject) => {
    addTemplates({
      electionDefinition,
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

test('emits error on API failure', async () => {
  configMock.setElection.mockRejectedValueOnce(new Error('bad election!'));

  await expect(
    new Promise<void>((resolve, reject) => {
      addTemplates({ electionDefinition, ballots: [] })
        .on('error', (error) => {
          reject(error);
        })
        .on('completed', () => {
          resolve();
        });
    })
  ).rejects.toThrowError();
});
