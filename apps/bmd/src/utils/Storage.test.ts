import { LocalStorage, MemoryStorage } from './Storage'

describe('LocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('uses local storage as the backing store', () => {
    new LocalStorage().set('a', { b: 'c' })
    expect(JSON.parse(window.localStorage.getItem('a') || '')).toEqual({
      b: 'c',
    })

    window.localStorage.setItem('b', JSON.stringify({ a: 1 }))
    expect(new LocalStorage().get('b')).toEqual({ a: 1 })
  })

  it('fails if the underlying value is not JSON', () => {
    window.localStorage.setItem('a', 'this is not JSON')
    expect(() => new LocalStorage().get('a')).toThrowError(/JSON/)
  })

  it('can remove a value', () => {
    const storage = new LocalStorage()

    expect(storage.get('a')).toBeUndefined()
    window.localStorage.setItem('a', JSON.stringify({}))
    expect(storage.get('a')).toBeDefined()
    storage.remove('a')
    expect(storage.get('a')).toBeUndefined()
  })

  it('can clear all values', () => {
    const storage = new LocalStorage()

    window.localStorage.setItem('a', JSON.stringify({}))
    window.localStorage.setItem('b', JSON.stringify({}))
    storage.clear()
    expect(storage.get('a')).toBeUndefined()
    expect(storage.get('b')).toBeUndefined()
  })

  it('serializes values as they are put in storage', () => {
    const storage = new LocalStorage()
    const object = { b: 1 }

    storage.set('a', object)
    object.b = 2

    expect(storage.get('a')).toEqual({ b: 1 })
  })
})

describe('MemoryStorage', () => {
  it('can be initialized with data', () => {
    const storage = new MemoryStorage({
      a: { c: 1 },
      b: { d: 2 },
    })

    expect(storage.get('a')).toEqual({ c: 1 })
    expect(storage.get('b')).toEqual({ d: 2 })
    expect(storage.get('c')).toBeUndefined()
  })

  it('can remove a value', () => {
    const storage = new MemoryStorage()

    storage.set('a', {})
    expect(storage.get('a')).toBeDefined()
    storage.remove('a')
    expect(storage.get('a')).toBeUndefined()
  })

  it('can clear all values', () => {
    const storage = new MemoryStorage()

    storage.set('a', {})
    storage.set('b', {})
    storage.clear()
    expect(storage.get('a')).toBeUndefined()
    expect(storage.get('b')).toBeUndefined()
  })

  it('serializes values as they are put in storage', () => {
    const storage = new MemoryStorage()
    const object = { b: 1 }

    storage.set('a', object)
    object.b = 2

    expect(storage.get('a')).toEqual({ b: 1 })
  })
})
