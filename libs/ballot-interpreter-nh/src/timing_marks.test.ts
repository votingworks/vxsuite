import { generateTemplateTimingMarkRects } from '../test/fixtures';
import { testImageDebugger } from '../test/utils';
import { computeTimingMarkGrid } from './timing_marks';

test('computeTimingMarkGrid legal-size ballot card', () => {
  const generated = generateTemplateTimingMarkRects();
  const debug = testImageDebugger(generated.canvasSize);
  const grid = computeTimingMarkGrid(generated.complete, {
    debug,
  });
  expect(grid.rows).toHaveLength(generated.complete.left.length);
  for (const row of grid.rows) {
    expect(row).toHaveLength(generated.complete.top.length);
  }
});
