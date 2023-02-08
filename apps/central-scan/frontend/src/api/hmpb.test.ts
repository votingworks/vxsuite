import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import { Scan } from '@votingworks/api';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { Buffer } from 'buffer';
import { addTemplates, fetchNextBallotSheetToReview } from './hmpb';
import * as config from './config';

jest.mock('./config');
const configMock = config as jest.Mocked<typeof config>;

test('configures the server with the contained election', async () => {
  configMock.setElection.mockResolvedValueOnce();
  const logger = fakeLogger();
  await new Promise<void>((resolve, reject) => {
    addTemplates(
      {
        electionDefinition,
        ballots: [],
      },
      logger,
      'election_manager'
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
  fetchMock.patchOnce('/central-scanner/config/election', {
    body: { status: 'ok' },
  });
  fetchMock.post('/central-scanner/scan/hmpb/addTemplates', {
    body: { status: 'ok' },
  });

  const uploading = jest.fn();
  const logger = fakeLogger();

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
              layoutFilename: 'layout-1.json',
              locales: { primary: 'en-US' },
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
              layoutFilename: 'layout-1.json',
              locales: { primary: 'en-US' },
            },
            pdf: Buffer.of(),
            layout: [],
          },
        ],
      },
      logger,
      'election_manager'
    )
      .on('error', (error) => {
        reject(error);
      })
      .on('uploading', uploading)
      .on('completed', () => {
        resolve();
      });
  });

  expect(
    fetchMock.calls('/central-scanner/scan/hmpb/addTemplates').length
  ).toEqual(2);
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BallotConfiguredOnMachine,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
      ballotStyleId: '5',
      precinctId: '21',
      isLiveMode: true,
    })
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BallotConfiguredOnMachine,
    'election_manager',
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

  const logger = fakeLogger();

  await expect(
    new Promise<void>((resolve, reject) => {
      addTemplates(
        {
          electionDefinition,
          ballots: [],
        },
        logger,
        'election_manager'
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
  const response: Scan.GetNextReviewSheetResponse = {
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
  fetchMock.getOnce('/central-scanner/scan/hmpb/review/next-sheet', {
    status: 200,
    body: response,
  });
  await expect(fetchNextBallotSheetToReview()).resolves.toBeDefined();
});

test('returns undefined if there are no ballot sheets to review', async () => {
  fetchMock.getOnce('/central-scanner/scan/hmpb/review/next-sheet', {
    status: 404,
    body: '',
  });
  await expect(fetchNextBallotSheetToReview()).resolves.toBeUndefined();
});
