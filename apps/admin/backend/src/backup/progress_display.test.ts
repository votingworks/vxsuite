import { expect, test } from 'vitest';
import { mockWritable } from '@votingworks/test-utils';
import {
  DisplayProgress,
  formatStepLabel,
  fractionComplete,
  ProgressDisplay,
  renderProgressLine,
  shouldRedraw,
} from './progress_display.js';

test('formats a step name for a person to read', () => {
  expect(formatStepLabel('copying_files')).toEqual('Copying files');
  expect(formatStepLabel('signing')).toEqual('Signing');
});

test('measures how far along a stage is', () => {
  expect(
    fractionComplete({ label: 'Copying', bytesCompleted: 0, bytesTotal: 200 })
  ).toEqual(0);
  expect(
    fractionComplete({ label: 'Copying', bytesCompleted: 50, bytesTotal: 200 })
  ).toEqual(0.25);
  expect(
    fractionComplete({ label: 'Copying', bytesCompleted: 200, bytesTotal: 200 })
  ).toEqual(1);
});

test('a stage with nothing to measure counts as complete', () => {
  // Otherwise its bar would sit empty for as long as the stage ran, which reads
  // as stuck rather than as unmeasurable.
  expect(fractionComplete({ label: 'Signing' })).toEqual(1);
  expect(
    fractionComplete({ label: 'Copying', bytesCompleted: 0, bytesTotal: 0 })
  ).toEqual(1);
});

test('never reports more than complete', () => {
  expect(
    fractionComplete({ label: 'Copying', bytesCompleted: 300, bytesTotal: 200 })
  ).toEqual(1);
});

test('renders a bar with counts', () => {
  expect(
    renderProgressLine({
      label: 'Copying files',
      bytesCompleted: 512 * 1024,
      bytesTotal: 1024 * 1024,
    })
  ).toEqual(
    'Copying files  [████████████░░░░░░░░░░░░]  50%  512.0 KB of 1.0 MB'
  );
});

test('renders a full bar and no counts for an unmeasurable stage', () => {
  expect(renderProgressLine({ label: 'Signing' })).toEqual(
    'Signing  [████████████████████████] 100%'
  );
});

test('pads labels so the bars line up', () => {
  const copying = renderProgressLine({ label: 'Copying files' }, 20);
  const signing = renderProgressLine({ label: 'Signing' }, 20);
  expect(copying.indexOf('[')).toEqual(signing.indexOf('['));
});

test('redraws only when the percentage changes', () => {
  const progress: DisplayProgress = {
    label: 'Copying',
    bytesCompleted: 50,
    bytesTotal: 200,
  };
  expect(shouldRedraw(progress, undefined)).toEqual(true);
  expect(shouldRedraw(progress, 25)).toEqual(false);
  expect(shouldRedraw({ ...progress, bytesCompleted: 51 }, 25)).toEqual(false);
  expect(shouldRedraw({ ...progress, bytesCompleted: 52 }, 25)).toEqual(true);
});

test('writes one line per percent when not attached to a terminal', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, false, 8);

  const bytesTotal = 1000;
  for (
    let bytesCompleted = 0;
    bytesCompleted <= bytesTotal;
    bytesCompleted += 1
  ) {
    display.update({ label: 'Copying', bytesCompleted, bytesTotal });
  }
  display.finish();

  const lines = stream.toString().trim().split('\n');
  expect(lines).toHaveLength(101);
  expect(lines[0]).toContain('  0%');
  expect(lines[lines.length - 1]).toContain('100%');
});

test('starts a new bar when the stage changes', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, false, 8);

  display.update({ label: 'Copying', bytesCompleted: 10, bytesTotal: 10 });
  display.update({ label: 'Verifying', bytesCompleted: 0, bytesTotal: 10 });
  display.finish();

  const lines = stream.toString().trim().split('\n');
  // Both are drawn even though the second is 0% and the first was 100%: it is
  // a different stage, not a redraw of the same one.
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain('Copying');
  expect(lines[0]).toContain('100%');
  expect(lines[1]).toContain('Verifying');
  expect(lines[1]).toContain('  0%');
});

// \u001b[2K is the ANSI erase-line control sequence, which the display uses to
// redraw the bar in place.
const ERASE_LINE = '\r\u001b[2K';

test('redraws over one row on a terminal', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, true, 8);

  display.update({ label: 'Copying', bytesCompleted: 0, bytesTotal: 100 });
  display.update({ label: 'Copying', bytesCompleted: 50, bytesTotal: 100 });
  display.finish();

  const output = stream.toString();
  // Each redraw returns to the start of the row and erases it, so the bar never
  // scrolls; only the final newline ends the row.
  expect(output.split(ERASE_LINE)).toHaveLength(3);
  expect(output.endsWith('\n')).toEqual(true);
  expect(output.slice(0, -1)).not.toContain('\n');
});

test('prints log lines above the bar, leaving it at the bottom', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, true, 8);

  display.update({ label: 'Copying', bytesCompleted: 50, bytesTotal: 100 });
  display.writeAbove('{"eventId":"backup-create-progress"}');

  const output = stream.toString();
  const barLine = renderProgressLine(
    { label: 'Copying', bytesCompleted: 50, bytesTotal: 100 },
    8
  );
  // The bar is redrawn after the log line, so it ends up below it.
  expect(output).toEqual(
    `${ERASE_LINE}${barLine}${ERASE_LINE}{"eventId":"backup-create-progress"}\n${barLine}`
  );
});

test('writes a log line plainly when there is no bar to move', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, true, 8);

  display.writeAbove('a line');

  expect(stream.toString()).toEqual(`${ERASE_LINE}a line\n`);
});
