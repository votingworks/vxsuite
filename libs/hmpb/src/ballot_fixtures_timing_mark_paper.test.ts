import { afterAll, beforeAll, describe, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { timingMarkPaperFixtures } from './ballot_fixtures';
import { createPlaywrightRenderer } from './playwright_renderer';
import { Renderer } from './renderer';

vi.setConfig({
  testTimeout: 120_000,
});

let renderer: Renderer;
beforeAll(async () => {
  renderer = await createPlaywrightRenderer();
});

afterAll(async () => {
  await renderer.cleanup();
});

describe('fixtures are up to date - run `pnpm generate-fixtures` if this test fails', () => {
  test('timing mark paper fixtures', async () => {
    const fixtures = timingMarkPaperFixtures;

    for (const spec of fixtures.fixtureSpecs) {
      const generated = await fixtures.generate(renderer, spec);
      const paths = fixtures.specPaths(spec);
      await expectToMatchSavedPdf(generated.pdf, paths.pdf);
    }
  });
});
