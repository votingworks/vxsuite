import { electionSample as election } from '@votingworks/ballot-encoder'
import fetchMock from 'fetch-mock'
import { addTemplates } from './hmpb'

test('configures the server with the contained election', async () => {
  fetchMock.patchOnce('/config', { body: { status: 'ok' } })

  await new Promise((resolve, reject) => {
    addTemplates({ election, ballots: [] })
      .on('error', (error) => {
        reject(error)
      })
      .on('completed', () => {
        resolve()
      })
  })

  expect(
    JSON.parse(fetchMock.lastCall('/config')?.[1]?.body as string)
  ).toEqual({ election })
})

test('emits an event each time a ballot begins uploading', async () => {
  fetchMock.patchOnce('/config', { body: { status: 'ok' } })
  fetchMock.post('/scan/hmpb/addTemplates', { body: { status: 'ok' } })

  const uploading = jest.fn()

  await new Promise((resolve, reject) => {
    addTemplates({
      election,
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
  fetchMock.patchOnce('/config', { status: 400, body: { status: 'nope' } })

  await expect(
    new Promise((resolve, reject) => {
      addTemplates({ election, ballots: [] })
        .on('error', (error) => {
          reject(error)
        })
        .on('completed', () => {
          resolve()
        })
    })
  ).rejects.toThrowError()
})
