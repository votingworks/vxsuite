import { promises as fs } from 'fs'
import * as tmp from 'tmp'
import Store from './store'
import election from '../test/fixtures/hmpb-dallas-county/election'

test('get/set election', async () => {
  const store = await Store.memoryStore()

  expect(await store.getElection()).toBeUndefined()

  await store.setElection(election)
  expect(await store.getElection()).toEqual(election)

  await store.setElection(undefined)
  expect(await store.getElection()).toBeUndefined()
})

test('get/set test mode', async () => {
  const store = await Store.memoryStore()

  expect(await store.getTestMode()).toBe(false)

  await store.setTestMode(true)
  expect(await store.getTestMode()).toBe(true)

  await store.setTestMode(false)
  expect(await store.getTestMode()).toBe(false)
})

test('HMPB template handling', async () => {
  const store = await Store.memoryStore()

  expect(await store.getHmpbTemplates()).toEqual([])

  await store.addHmpbTemplate(Buffer.of(1, 2, 3), {
    ballotStyleId: '12D',
    precinctId: '99',
    isTestBallot: false,
  })

  expect(await store.getHmpbTemplates()).toEqual([
    [
      Buffer.of(1, 2, 3),
      {
        ballotStyleId: '12D',
        precinctId: '99',
        isTestBallot: false,
      },
    ],
  ])
})

test('destroy database', async () => {
  const dbFile = tmp.fileSync()
  const store = new Store(dbFile.name)

  await store.init()
  await fs.access(dbFile.name)

  await store.dbDestroy()
  await expect(fs.access(dbFile.name)).rejects.toThrowError('ENOENT')
})
