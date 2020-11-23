import MultiMap from './MultiMap'

test('can have multiple string keys', () => {
  const map = new MultiMap<[string, string], unknown>()
  const value = { foo: 'bar' }
  map.set(['a', 'b'], value)
  const values = map.get(['a', 'b'])
  expect([...values!][0]).toBe(value)
  expect(map.get(['a', ''])).toBeUndefined()
  expect(map.get(['b', 'a'])).toBeUndefined()
})

test('can have mutiple values', () => {
  const map = new MultiMap<[string], number>()
  map.set(['a'], 1).set(['a'], 2).set(['a'], 3)
  expect(map.get(['a'])).toEqual(new Set([1, 2, 3]))
})

test('ignores duplicate values per key', () => {
  const map = new MultiMap<[string], number>()
  map.set(['a'], 1).set(['a'], 1)
  expect(map.get(['a'])).toEqual(new Set([1]))
})

test('can iterate over values', () => {
  const map = new MultiMap<[string], number>()
  map.set(['a'], 1)
  map.set(['a'], 2)
  map.set(['b'], 1)
  expect([...map]).toEqual([
    [['a'], new Set([1, 2])],
    [['b'], new Set([1])],
  ])
})

test('can clear entries', () => {
  const map = new MultiMap<[string], number>()
  map.set(['a'], 1)
  expect(map.size).toEqual(1)
  map.clear()
  expect(map.size).toEqual(0)
})

test('can delete by key', () => {
  const map = new MultiMap<[string], number>()
  map.set(['a'], 1)
  map.delete(['a'])
  expect(map.get(['a'])).toBeUndefined()
})

test('can delete by key and value', () => {
  const map = new MultiMap<[string], number>()
  map.set(['a'], 1)
  expect(map.delete(['a'], 2)).toBeFalsy()
  expect(map.delete(['a'], 1)).toBeTruthy()
  expect(map.get(['a'])).toBeUndefined()
})

test('has sizes for keys and values', () => {
  const map = new MultiMap<[string], number>()
  map.set(['a'], 1)
  map.set(['a'], 2)
  map.set(['b'], 3)
  expect(map.size).toEqual(2)
  expect(map.keySize).toEqual(2)
  expect(map.valueSize).toEqual(3)
})
