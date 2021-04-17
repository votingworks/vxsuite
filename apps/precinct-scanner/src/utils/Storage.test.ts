import { fakeKiosk } from '@votingworks/test-utils'
import { KioskStorage, LocalStorage, MemoryStorage } from './Storage'

describe('LocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('uses local storage as the backing store', async () => {
    const storage = new LocalStorage()
    await storage.set('a', { b: 'c' })
    expect(JSON.parse(window.localStorage.getItem('a') || '')).toEqual({
      b: 'c',
    })

    window.localStorage.setItem('b', JSON.stringify({ a: 1 }))
    expect(await new LocalStorage().get('b')).toEqual({ a: 1 })
  })

  it('fails if the underlying value is not JSON', async () => {
    window.localStorage.setItem('a', 'this is not JSON')
    await expect(async () => await new LocalStorage().get('a')).rejects.toThrow(
      /JSON/
    )
  })

  it('can remove a value', async () => {
    const storage = new LocalStorage()

    expect(await storage.get('a')).toBeUndefined()
    window.localStorage.setItem('a', JSON.stringify({}))
    expect(await storage.get('a')).toBeDefined()
    storage.remove('a')
    expect(await storage.get('a')).toBeUndefined()
  })

  it('can clear all values', async () => {
    const storage = new LocalStorage()

    window.localStorage.setItem('a', JSON.stringify({}))
    window.localStorage.setItem('b', JSON.stringify({}))
    await storage.clear()
    expect(await storage.get('a')).toBeUndefined()
    expect(await storage.get('b')).toBeUndefined()
  })

  it('serializes values as they are put in storage', async () => {
    const storage = new LocalStorage()
    const object = { b: 1 }

    await storage.set('a', object)
    object.b = 2

    expect(await storage.get('a')).toEqual({ b: 1 })
  })
})

describe('MemoryStorage', () => {
  it('can be initialized with data', async () => {
    const storage = new MemoryStorage({
      a: { c: 1 },
      b: { d: 2 },
    })

    expect(await storage.get('a')).toEqual({ c: 1 })
    expect(await storage.get('b')).toEqual({ d: 2 })
    expect(await storage.get('c')).toBeUndefined()
  })

  it('can remove a value', async () => {
    const storage = new MemoryStorage()

    await storage.set('a', {})
    expect(await storage.get('a')).toBeDefined()
    await storage.remove('a')
    expect(await storage.get('a')).toBeUndefined()
  })

  it('can clear all values', async () => {
    const storage = new MemoryStorage()

    await storage.set('a', {})
    await storage.set('b', {})
    await storage.clear()
    expect(await storage.get('a')).toBeUndefined()
    expect(await storage.get('b')).toBeUndefined()
  })

  it('serializes values as they are put in storage', async () => {
    const storage = new MemoryStorage()
    const object = { b: 1 }

    await storage.set('a', object)
    object.b = 2

    expect(await storage.get('a')).toEqual({ b: 1 })
  })
})

describe('KioskStorage', () => {
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
})
