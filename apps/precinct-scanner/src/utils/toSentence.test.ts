import { toSentence } from './toSentence'

test('empty list', () => {
  expect(toSentence([])).toEqual([])
})

test('single-element list', () => {
  expect(toSentence(['Mayor'])).toEqual(['Mayor'])
})

test('two-element list', () => {
  expect(toSentence(['Mayor', 'Senator'])).toEqual([
    'Mayor',
    ' and ',
    'Senator',
  ])
})

test('three-element list', () => {
  expect(toSentence(['Mayor', 'Senator', 'Sheriff'])).toEqual([
    'Mayor',
    ', ',
    'Senator',
    ', ',
    ' and ',
    'Sheriff',
  ])
})
