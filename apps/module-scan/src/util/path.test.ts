import { normalizeAndJoin } from './path'

test('normalizeAndJoin with a single path', () => {
  expect(normalizeAndJoin('a.txt')).toEqual('a.txt')
})

test('normalizeAndJoin with multiple relative path parts', () => {
  expect(normalizeAndJoin('a/b', 'c/d', 'e.txt')).toEqual('a/b/c/d/e.txt')
})

test('normalizeAndJoin with a leading absolute path', () => {
  expect(normalizeAndJoin('/a', 'b', 'c.txt')).toEqual('/a/b/c.txt')
})

test('normalizeAndJoin with non-leading absolute paths', () => {
  expect(normalizeAndJoin('a', '/b', '/c', '../d.txt')).toEqual('/d.txt')
})
