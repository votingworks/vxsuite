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

test('formats locale numeric date and time', () => {
  expect(
    format.localeNumericDateAndTime(new Date(2020, 3, 14, 1, 15, 9, 26))
  ).toEqual('4/14/2020, 1:15:09 AM');
});

test('formats locale short date and time properly', () => {
  expect(
    format.localeShortDateAndTime(new Date(2020, 3, 14, 1, 15, 9, 26))
  ).toEqual('4/14/2020, 1:15 AM');
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

test('formats locale time properly', () => {
  expect(format.localeTime(new Date(2020, 3, 14, 1, 15, 9, 26))).toEqual(
    '1:15 AM'
  );
});

test('formats clock date and time properly', () => {
  expect(format.clockDateAndTime(new Date(2020, 3, 14, 1, 15, 9, 26))).toEqual(
    'Tue, Apr 14, 1:15 AM'
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

describe('bytes()', () => {
  test('formats zero bytes', () => {
    expect(format.bytes(0)).toEqual('0 B');
  });

  test('formats bytes', () => {
    expect(format.bytes(1)).toEqual('1.0 B');
    expect(format.bytes(512)).toEqual('512.0 B');
    expect(format.bytes(1023)).toEqual('1023.0 B');
  });

  test('formats kilobytes', () => {
    expect(format.bytes(1024)).toEqual('1.0 KB');
    expect(format.bytes(1536)).toEqual('1.5 KB');
    expect(format.bytes(10240)).toEqual('10.0 KB');
    expect(format.bytes(1048575)).toEqual('1024.0 KB');
  });

  test('formats megabytes', () => {
    expect(format.bytes(1048576)).toEqual('1.0 MB');
    expect(format.bytes(5242880)).toEqual('5.0 MB');
    expect(format.bytes(536870912 - 1)).toEqual('512.0 MB');
  });

  test('formats gigabytes', () => {
    expect(format.bytes(1073741824)).toEqual('1.0 GB');
    expect(format.bytes(5368709120)).toEqual('5.0 GB');
    expect(format.bytes(536870912)).toEqual('512.0 MB'); // 0.5 GB displays as 512 MB
    expect(format.bytes(10737418240)).toEqual('10.0 GB');
  });

  test('formats terabytes', () => {
    expect(format.bytes(1099511627776)).toEqual('1.0 TB');
    expect(format.bytes(5497558138880)).toEqual('5.0 TB');
  });

  test('respects custom fraction digits', () => {
    expect(format.bytes(1536, { fractionDigits: 0 })).toEqual('2 KB');
    expect(format.bytes(1536, { fractionDigits: 2 })).toEqual('1.50 KB');
    expect(format.bytes(1073741824, { fractionDigits: 3 })).toEqual(
      '1.000 GB'
    );
  });
});

