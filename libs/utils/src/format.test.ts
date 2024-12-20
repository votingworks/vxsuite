import { describe, expect, test } from 'vitest';
import { TestLanguageCode } from '@votingworks/test-utils';
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
  expect(format.count(40240, 'en')).toEqual('40,240');
  expect(format.count(40240, 'es-US')).toEqual('40,240');
  // Force-cast a non-Vx language to test locale-specific formatting:
  expect(format.count(40240, 'es-ES')).toEqual('40.240');
});

test('formats locale long date and time properly', () => {
  expect(
    format.localeLongDateAndTime(new Date(2020, 3, 14, 1, 15, 9, 26))
  ).toEqual('Tuesday, April 14, 2020 at 1:15:09 AM AKDT');
});

test('formats locale weekday and date properly', () => {
  expect(
    format.localeWeekdayAndDate(new Date(2020, 3, 14, 1, 15, 9, 26))
  ).toEqual('Tuesday, April 14, 2020');
});

test('formats locale long date properly', () => {
  expect(format.localeLongDate(new Date(2020, 3, 14, 1, 15, 9, 26))).toEqual(
    'April 14, 2020'
  );
  expect(
    format.localeLongDate(new Date(2020, 3, 14, 1, 15, 9, 26), 'en')
  ).toEqual('April 14, 2020');
  expect(
    format.localeLongDate(new Date(2020, 3, 14, 1, 15, 9, 26), 'es-US')
  ).toEqual('14 de abril de 2020');
  expect(
    format.localeLongDate(new Date(2020, 3, 14, 1, 15, 9, 26), 'zh-Hant')
  ).toEqual('2020年4月14日');
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

describe('languageDisplayName()', () => {
  const { ENGLISH, SPANISH } = TestLanguageCode;

  test('happy paths', () => {
    expect(format.languageDisplayName({ languageCode: SPANISH })).toMatch(
      /^español \(ee\. uu\.\)/i
    );

    expect(
      format.languageDisplayName({
        displayLanguageCode: ENGLISH,
        languageCode: SPANISH,
      })
    ).toMatch(/^spanish \(us\)/i);

    expect(
      format.languageDisplayName({
        displayLanguageCode: ENGLISH,
        languageCode: SPANISH,
        style: 'long',
      })
    ).toMatch(/^spanish \(united states\)/i);
  });

  test('throws for unsupported languages', () => {
    expect(() =>
      format.languageDisplayName({
        languageCode: 'not-a-language',
      })
    ).toThrow();
  });
});
