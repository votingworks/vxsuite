import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import { GetNextReviewSheetResponse } from '@votingworks/types/api/services/scan';
import { Logger, LogSource, LogEventId } from '@votingworks/logging';
import { addTemplates, fetchNextBallotSheetToReview } from './hmpb';
import * as config from './config';

jest.mock('./config');
const configMock = config as jest.Mocked<typeof config>;

test('configures the server with the contained election', async () => {
  configMock.setElection.mockResolvedValueOnce();
  const logger = new Logger(LogSource.VxCentralScanFrontend);
  await new Promise<void>((resolve, reject) => {
    addTemplates(
      {
        electionDefinition,
        ballots: [],
      },
      logger,
      'admin'
    )
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
  fetchMock.patchOnce('/config/election', { body: { status: 'ok' } });
  fetchMock.post('/scan/hmpb/addTemplates', { body: { status: 'ok' } });

  const uploading = jest.fn();
  const logger = new Logger(LogSource.VxCentralScanFrontend);
  const logSpy = jest.spyOn(logger, 'log');

  await new Promise<void>((resolve, reject) => {
    addTemplates(
      {
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
            },
            pdf: Buffer.of(),
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
            },
            pdf: Buffer.of(),
          },
        ],
      },
      logger,
      'admin'
    )
      .on('error', (error) => {
        reject(error);
      })
      .on('uploading', uploading)
      .on('completed', () => {
        resolve();
      });
  });

  expect(fetchMock.calls('/scan/hmpb/addTemplates').length).toEqual(2);
  expect(logSpy).toHaveBeenCalledTimes(2);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.BallotConfiguredOnMachine,
    'admin',
    expect.objectContaining({
      disposition: 'success',
      ballotStyleId: '5',
      precinctId: '21',
      isLiveMode: true,
    })
  );
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.BallotConfiguredOnMachine,
    'admin',
    expect.objectContaining({
      disposition: 'success',
      ballotStyleId: '5',
      precinctId: '21',
      isLiveMode: false,
    })
  );
});

test('emits error on API failure', async () => {
  configMock.setElection.mockRejectedValueOnce(new Error('bad election!'));

  const logger = new Logger(LogSource.VxCentralScanFrontend);

  await expect(
    new Promise<void>((resolve, reject) => {
      addTemplates(
        {
          electionDefinition,
          ballots: [],
        },
        logger,
        'admin'
      )
        .on('error', (error) => {
          reject(error);
        })
        .on('completed', () => {
          resolve();
        });
    })
  ).rejects.toThrowError();
});

test('can fetch the next ballot sheet needing review', async () => {
  const response: GetNextReviewSheetResponse = {
    interpreted: {
      id: 'test-sheet',
      front: {
        image: { url: '/' },
        interpretation: { type: 'UnreadablePage' },
      },
      back: {
        image: { url: '/' },
        interpretation: { type: 'UnreadablePage' },
      },
    },
    layouts: {},
    definitions: {},
  };
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', {
    status: 200,
    body: response,
  });
  await expect(fetchNextBallotSheetToReview()).resolves.toBeDefined();
});

test('returns undefined if there are no ballot sheets to review', async () => {
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', { status: 404, body: '' });
  await expect(fetchNextBallotSheetToReview()).resolves.toBeUndefined();
});
