import { afterAll, beforeAll, describe, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { calibrationSheetFixtures } from './ballot_fixtures';
import { createPlaywrightRenderer } from './playwright_renderer';
import { SingletonRenderer } from './renderer';

vi.setConfig({
  testTimeout: 120_000,
});

let renderer: SingletonRenderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});

afterAll(async () => {
  await renderer.close();
});

describe('fixtures are up to date - run `pnpm generate-fixtures` if this test fails', () => {
  test('calibration sheet fixtures', async () => {
    const fixtures = calibrationSheetFixtures;

    for (const spec of fixtures.fixtureSpecs) {
      const generated = await fixtures.generate(renderer, spec);
      const paths = fixtures.specPaths(spec);
      await expectToMatchSavedPdf(generated.pdf, paths.pdf);
    }
  });
});
