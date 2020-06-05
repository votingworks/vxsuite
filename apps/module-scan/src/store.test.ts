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
