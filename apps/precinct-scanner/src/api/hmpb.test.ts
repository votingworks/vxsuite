import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures'
import fetchMock from 'fetch-mock'
import {
  addTemplates,
  fetchBallotInfo,
  fetchNextBallotSheetToReview,
  fetchNextBallotToReview,
} from './hmpb'
import * as config from './config'

jest.mock('./config')
const configMock = config as jest.Mocked<typeof config>

test('configures the server with the contained election', async () => {
  configMock.setElection.mockResolvedValueOnce()

  await new Promise<void>((resolve, reject) => {
    addTemplates({ electionDefinition, ballots: [] })
      .on('error', (error) => {
        reject(error)
      })
      .on('completed', () => {
        resolve()
      })
  })

  expect(configMock.setElection).toHaveBeenCalledWith(
    electionDefinition.electionData
  )
})

test('emits an event each time a ballot begins uploading', async () => {
  fetchMock.patchOnce('/config/election', { body: { status: 'ok' } })
  fetchMock.post('/scan/hmpb/addTemplates', { body: { status: 'ok' } })

  const uploading = jest.fn()

  await new Promise<void>((resolve, reject) => {
    addTemplates({
      electionDefinition,
      ballots: [
        {
          ballotConfig: {
            ballotStyleId: '5',
            precinctId: '21',
            isLiveMode: true,
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
            contestIds: ['a', 'b', 'c'],
            filename: 'ballot-1-test.pdf',
            locales: { primary: 'en-US' },
          },
          pdf: Buffer.of(),
        },
      ],
    })
      .on('error', (error) => {
        reject(error)
      })
      .on('uploading', uploading)
      .on('completed', () => {
        resolve()
      })
  })

  expect(fetchMock.calls('/scan/hmpb/addTemplates').length).toEqual(2)
})

test('emits error on API failure', async () => {
  configMock.setElection.mockRejectedValueOnce(new Error('bad election!'))

  await expect(
    new Promise<void>((resolve, reject) => {
      addTemplates({ electionDefinition, ballots: [] })
        .on('error', (error) => {
          reject(error)
        })
        .on('completed', () => {
          resolve()
        })
    })
  ).rejects.toThrowError()
})

test('can fetch ballot info by id', async () => {
  fetchMock.getOnce('/scan/hmpb/ballot/42', { status: 200, body: {} })
  await expect(fetchBallotInfo('42')).resolves.toBeDefined()
})

test('can fetch the next ballot needing review', async () => {
  fetchMock.getOnce('/scan/hmpb/review/next-ballot', { status: 200, body: {} })
  await expect(fetchNextBallotToReview()).resolves.toBeDefined()
})

test('returns undefined if there are no ballots to review', async () => {
  fetchMock.getOnce('/scan/hmpb/review/next-ballot', { status: 404, body: {} })
  await expect(fetchNextBallotToReview()).resolves.toBeUndefined()
})

test('can fetch the next ballot sheet needing review', async () => {
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', { status: 200, body: {} })
  await expect(fetchNextBallotSheetToReview()).resolves.toBeDefined()
})

test('returns undefined if there are no ballot sheets to review', async () => {
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', { status: 404, body: {} })
  await expect(fetchNextBallotSheetToReview()).resolves.toBeUndefined()
})
