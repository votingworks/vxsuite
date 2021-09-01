import { fakeKiosk } from '@votingworks/test-utils'
import KioskStorage from './KioskStorage'

beforeEach(() => {
  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk
})

it('can remove a value', async () => {
  const storage = new KioskStorage()

  await storage.remove('a')
  expect(window.kiosk?.storage.remove).toHaveBeenCalledWith('a')
})

it('can clear all values', async () => {
  const storage = new KioskStorage()

  await storage.clear()
  expect(window.kiosk?.storage.clear).toHaveBeenCalled()
})

it('can set a value', async () => {
  const storage = new KioskStorage()
  const object = { b: 1 }

  await storage.set('a', object)
  expect(window.kiosk?.storage.set).toHaveBeenCalledWith('a', object)
})

it('can get a value', async () => {
  const storage = new KioskStorage()
  window.kiosk!.storage.get = jest.fn().mockResolvedValueOnce('value')

  expect(await storage.get('a')).toEqual('value')
  expect(window.kiosk?.storage.get).toHaveBeenCalledWith('a')
})
