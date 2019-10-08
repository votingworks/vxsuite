import alphaSort from './alphaSort'

it('sorts arrays', () => {
  expect(
    ['c', 'a', 'z', 'b', 'b'].sort((a, b) => alphaSort(a, b)).join('')
  ).toBe('abbcz')
})
