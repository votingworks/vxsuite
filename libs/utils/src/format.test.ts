import * as format from './format'

test('formats counts properly', () => {
  expect(format.count(0)).toEqual('0')
  expect(format.count(1)).toEqual('1')
  expect(format.count(314.23)).toEqual('314.23')
  expect(format.count(1000.79)).toEqual('1,000.79')
  expect(format.count(3141)).toEqual('3,141')
  expect(format.count(1000000)).toEqual('1,000,000')
  expect(format.count(3141098210928)).toEqual('3,141,098,210,928')
  expect(format.count(-1)).toEqual('-1')
  expect(format.count(-314.23)).toEqual('-314.23')
  expect(format.count(-1000.79)).toEqual('-1,000.79')
  expect(format.count(-3141)).toEqual('-3,141')
  expect(format.count(-1000000)).toEqual('-1,000,000')
  expect(format.count(-3141098210928)).toEqual('-3,141,098,210,928')
})
