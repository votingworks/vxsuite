import numberWithCommas from './numberWithCommas'

test('leaves single-digit values alone', () => {
  for (let i = 0; i <= 9; i++) {
    expect(numberWithCommas(i)).toEqual(`${i}`)
  }
})

test('leaves double-digit values alone', () => {
  for (let i = 10; i <= 99; i++) {
    expect(numberWithCommas(i)).toEqual(`${i}`)
  }
})

test('leaves triple-digit values alone', () => {
  for (let i = 100; i <= 999; i++) {
    expect(numberWithCommas(i)).toEqual(`${i}`)
  }
})

test('inserts a grouping separator between the hundreds and thousands places', () => {
  expect(numberWithCommas(1000)).toEqual('1,000')
  expect(numberWithCommas(1234)).toEqual('1,234')
  expect(numberWithCommas(9999)).toEqual('9,999')
  expect(numberWithCommas(58763)).toEqual('58,763')
})

test('inserts grouping separators at all relevant places', () => {
  expect(numberWithCommas(1000000000)).toEqual('1,000,000,000')
  expect(numberWithCommas(1234567890)).toEqual('1,234,567,890')
  expect(numberWithCommas(9999999999)).toEqual('9,999,999,999')
  expect(numberWithCommas(5876319472)).toEqual('5,876,319,472')
})
