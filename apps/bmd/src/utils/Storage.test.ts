import { LocalStorage, MemoryStorage } from './Storage'

describe('LocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('uses local storage as the backing store', () => {
    new LocalStorage<{ a: { b: string } }>().set('a', { b: 'c' })
    expect(JSON.parse(window.localStorage.getItem('a') || '')).toEqual({
      b: 'c',
    })

    window.localStorage.setItem('b', JSON.stringify({ a: 1 }))
    expect(new LocalStorage<{ b: { a: number } }>().get('b')).toEqual({ a: 1 })
  })

  it('fails if the underlying value is not JSON', () => {
    window.localStorage.setItem('a', 'this is not JSON')
    expect(() => new LocalStorage<{ a: object }>().get('a')).toThrowError(
      /JSON/
    )
  })

  it('can remove a value', () => {
    const storage = new LocalStorage<{ a: object }>()

    expect(storage.get('a')).toBeUndefined()
    window.localStorage.setItem('a', JSON.stringify({}))
    expect(storage.get('a')).toBeDefined()
    storage.remove('a')
    expect(storage.get('a')).toBeUndefined()
  })

  it('can clear all values', () => {
    const storage = new LocalStorage<{ a: object; b: object }>()

    window.localStorage.setItem('a', JSON.stringify({}))
    window.localStorage.setItem('b', JSON.stringify({}))
    storage.clear()
    expect(storage.get('a')).toBeUndefined()
    expect(storage.get('b')).toBeUndefined()
  })

  it('serializes values as they are put in storage', () => {
    const storage = new LocalStorage<{ a: object }>()
    const object = { b: 1 }

    storage.set('a', object)
    object.b = 2

    expect(storage.get('a')).toEqual({ b: 1 })
  })
})

describe('MemoryStorage', () => {
  it('can be initialized with data', () => {
    const storage = new MemoryStorage<{ a: object; b: object; c: object }>({
      a: { c: 1 },
      b: { d: 2 },
    })

    expect(storage.get('a')).toEqual({ c: 1 })
    expect(storage.get('b')).toEqual({ d: 2 })
    expect(storage.get('c')).toBeUndefined()
  })

  it('can remove a value', () => {
    const storage = new MemoryStorage<{ a: object }>()

    storage.set('a', {})
    expect(storage.get('a')).toBeDefined()
    storage.remove('a')
    expect(storage.get('a')).toBeUndefined()
  })

  it('can clear all values', () => {
    const storage = new MemoryStorage<{ a: object; b: object }>()

    storage.set('a', {})
    storage.set('b', {})
    storage.clear()
    expect(storage.get('a')).toBeUndefined()
    expect(storage.get('b')).toBeUndefined()
  })

  it('serializes values as they are put in storage', () => {
    const storage = new MemoryStorage<{ a: object }>()
    const object = { b: 1 }

    storage.set('a', object)
    object.b = 2

    expect(storage.get('a')).toEqual({ b: 1 })
  })
})
