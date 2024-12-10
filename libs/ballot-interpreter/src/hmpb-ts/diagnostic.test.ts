import { expect, test } from 'vitest';
import { join } from 'node:path';
import { runBlankPaperDiagnostic } from './diagnostic';

test('runBlankPaperDiagnostic can pass', () => {
  expect(
    runBlankPaperDiagnostic(
      join(
        __dirname,
        '../../test/fixtures/diagnostic/blank/20lb/bc0367d0-444a-4f1b-a88e-78de0bda5cb5-back.jpg'
      )
    )
  ).toEqual(true);
});

test('runBlankPaperDiagnostic can fail', () => {
  expect(
    runBlankPaperDiagnostic(
      join(
        __dirname,
        '../../test/fixtures/diagnostic/streaked/0dc29646-3c6a-4abd-9d2d-ae1b03a3b4ad-front.jpg'
      )
    )
  ).toEqual(false);
});
