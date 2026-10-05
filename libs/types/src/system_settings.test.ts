import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { z } from 'zod/v4';

import {
  DEFAULT_MARK_THRESHOLDS,
  DEFAULT_SYSTEM_SETTINGS,
  safeParseSystemSettings,
} from './system_settings.js';

const systemSettingsString = JSON.stringify(DEFAULT_SYSTEM_SETTINGS);

test('safeParseSystemSettings safely parses valid system settings', () => {
  expect(safeParseSystemSettings(systemSettingsString)).toEqual(
    ok(DEFAULT_SYSTEM_SETTINGS)
  );
});

test('safeParseSystemSettings returns an error for malformed system settings', () => {
  expect(safeParseSystemSettings(JSON.stringify({ invalid: 'field' }))).toEqual(
    err(expect.anything())
  );
});

test('disallows invalid mark thresholds', () => {
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { definite: 0.2, marginal: 0.3 },
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { marginal: 0.3 },
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { definite: 1.2, marginal: 0.3 },
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('disallows invalid adjudication reasons', () => {
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        precinctScanAdjudicationReasons: ['abcdefg'],
        centralScanAdjudicationReasons: ['abcdefg'],
        adminAdjudicationReasons: ['abcdefg'],
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        centralScanAdjudicationReasons: 'foooo',
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('disallows enforcement flags without polls close time', () => {
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        disallowClosingPollsBeforeElectionDayPollsCloseTime: true,
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('parses a valid number of report copies', () => {
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        precinctScanNumberOfReportCopies: 3,
      })
    )
  ).toEqual(
    ok({
      ...DEFAULT_SYSTEM_SETTINGS,
      precinctScanNumberOfReportCopies: 3,
    })
  );
});

test('disallows a number of report copies less than one or non-integer', () => {
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        precinctScanNumberOfReportCopies: 0,
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        precinctScanNumberOfReportCopies: 1.5,
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('disallows retry streak threshold greater than or equal to normal threshold', () => {
  // Valid: retry threshold less than normal threshold
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        maxCumulativeStreakWidth: 5,
        retryStreakWidthThreshold: 1,
      })
    )
  ).toEqual(
    ok({
      ...DEFAULT_SYSTEM_SETTINGS,
      maxCumulativeStreakWidth: 5,
      retryStreakWidthThreshold: 1,
    })
  );

  // Invalid: retry threshold equal to normal threshold
  // (pointless since the check is deterministic)
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        maxCumulativeStreakWidth: 5,
        retryStreakWidthThreshold: 5,
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();

  // Invalid: retry threshold greater than normal threshold
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        maxCumulativeStreakWidth: 5,
        retryStreakWidthThreshold: 10,
      })
    ).unsafeUnwrapErr()
  ).toMatchSnapshot();
});

test('parses supported ballot image bit depths only', () => {
  for (const ballotImageBitDepth of [1, 2, 8]) {
    expect(
      safeParseSystemSettings(
        JSON.stringify({ ...DEFAULT_SYSTEM_SETTINGS, ballotImageBitDepth })
      ).unsafeUnwrap().ballotImageBitDepth
    ).toEqual(ballotImageBitDepth);
  }
  for (const ballotImageBitDepth of [0, 4, 16, '2']) {
    expect(
      safeParseSystemSettings(
        JSON.stringify({ ...DEFAULT_SYSTEM_SETTINGS, ballotImageBitDepth })
      ).unsafeUnwrapErr()
    ).toBeInstanceOf(z.ZodError);
  }
});

test('fills in the write-in ink area threshold, converting a legacy fraction', () => {
  function parse(markThresholds: object) {
    return safeParseSystemSettings(
      JSON.stringify({ ...DEFAULT_SYSTEM_SETTINGS, markThresholds })
    ).unsafeUnwrap().markThresholds;
  }

  expect(DEFAULT_MARK_THRESHOLDS.writeInInkAreaMm2).toEqual(4);
  expect(parse({ marginal: 0.05, definite: 0.07 })).toEqual({
    marginal: 0.05,
    definite: 0.07,
    writeInInkAreaMm2: 4,
  });
  expect(
    parse({ marginal: 0.05, definite: 0.07, writeInInkAreaMm2: 12 })
  ).toEqual({ marginal: 0.05, definite: 0.07, writeInInkAreaMm2: 12 });
  expect(
    parse({ marginal: 0.05, definite: 0.07, writeInTextArea: 0.025 })
  ).toEqual({ marginal: 0.05, definite: 0.07, writeInInkAreaMm2: 3.9 });
  expect(parse({ marginal: 0.05, definite: 0.07, writeInTextArea: 0 })).toEqual(
    { marginal: 0.05, definite: 0.07, writeInInkAreaMm2: 0 }
  );
  expect(
    parse({
      marginal: 0.05,
      definite: 0.07,
      writeInTextArea: 0.025,
      writeInInkAreaMm2: 12,
    })
  ).toEqual({ marginal: 0.05, definite: 0.07, writeInInkAreaMm2: 12 });
  expect(
    safeParseSystemSettings(
      JSON.stringify({
        ...DEFAULT_SYSTEM_SETTINGS,
        markThresholds: { marginal: 0.05, definite: 0.07, writeInTextArea: 2 },
      })
    ).unsafeUnwrapErr()
  ).toBeInstanceOf(z.ZodError);
});
