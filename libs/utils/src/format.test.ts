import * as format from './format';

test('formats counts properly', () => {
  expect(format.count(0)).toEqual('0');
  expect(format.count(1)).toEqual('1');
  expect(format.count(314.23)).toEqual('314.23');
  expect(format.count(1000.79)).toEqual('1,000.79');
  expect(format.count(3141)).toEqual('3,141');
  expect(format.count(1000000)).toEqual('1,000,000');
  expect(format.count(3141098210928)).toEqual('3,141,098,210,928');
  expect(format.count(-1)).toEqual('-1');
  expect(format.count(-314.23)).toEqual('-314.23');
  expect(format.count(-1000.79)).toEqual('-1,000.79');
  expect(format.count(-3141)).toEqual('-3,141');
  expect(format.count(-1000000)).toEqual('-1,000,000');
  expect(format.count(-3141098210928)).toEqual('-3,141,098,210,928');
});

test('formats locale long date properly', () => {
  expect(
    format.localeLongDateAndTime(new Date(2020, 3, 14, 1, 15, 9, 26))
  ).toEqual('Tuesday, April 14, 2020, 1:15:09 AM UTC');
});

test('formats locale weekday and date properly', () => {
  expect(
    format.localeWeekdayAndDate(new Date(2020, 3, 14, 1, 15, 9, 26))
  ).toEqual('Tuesday, April 14, 2020');
});

test('formats locale date properly', () => {
  expect(format.localeDate(new Date(2020, 3, 14, 1, 15, 9, 26))).toEqual(
    'Apr 14, 2020'
  );
});

test('formats percentages properly', () => {
  expect(format.percent(0)).toEqual('0%');
  expect(format.percent(1)).toEqual('100%');
  expect(format.percent(0.591)).toEqual('59%');
  expect(format.percent(0.591, { maximumFractionDigits: 1 })).toEqual('59.1%');
  expect(format.percent(0.591, { maximumFractionDigits: 2 })).toEqual('59.1%');
  expect(format.percent(0.5999, { maximumFractionDigits: 1 })).toEqual('60%');
});
