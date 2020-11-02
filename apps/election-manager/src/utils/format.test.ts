import * as format from './format'

test('formats counts using thousands separators as appropriate', () => {
  expect(format.count(0)).toEqual('0')
  expect(format.count(1)).toEqual('1')
  expect(format.count(-1)).toEqual('-1')
  expect(format.count(999)).toEqual('999')
  expect(format.count(1000)).toEqual('1,000')
  expect(format.count(-1000)).toEqual('-1,000')
  expect(format.count(1234567890)).toEqual('1,234,567,890')
})
