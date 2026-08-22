import { expect, test } from 'vitest';
import { mockWritable } from '@votingworks/test-utils';
import {
  DisplayProgress,
  fractionComplete,
  ProgressDisplay,
  renderProgressLine,
  shouldRedraw,
} from './progress_display.js';

// \u001b is ESC; [2K erases the line, so this is what a redraw in place
// writes before the bar.
const ERASE_LINE = '\r\u001b[2K';

test('fractionComplete measures bytes when there are bytes to measure', () => {
  expect(
    fractionComplete({ label: 'Copying', bytesCompleted: 25, bytesTotal: 100 })
  ).toEqual(0.25);

  // More bytes than expected still reads as complete rather than over 100%.
  expect(
    fractionComplete({ label: 'Copying', bytesCompleted: 150, bytesTotal: 100 })
  ).toEqual(1);
});

test('fractionComplete uses a reported fraction directly, clamped', () => {
  expect(fractionComplete({ label: 'Snapshotting', fraction: 0.5 })).toEqual(
    0.5
  );
  expect(fractionComplete({ label: 'Snapshotting', fraction: 1.5 })).toEqual(1);
  expect(fractionComplete({ label: 'Snapshotting', fraction: -1 })).toEqual(0);
});

test('fractionComplete treats nothing to measure as complete', () => {
  // Otherwise a step with no measure would render an empty bar forever.
  expect(fractionComplete({ label: 'Preparing' })).toEqual(1);
  expect(
    fractionComplete({ label: 'Copying', bytesCompleted: 0, bytesTotal: 0 })
  ).toEqual(1);
});

test('renderProgressLine shows a bar, a percentage, and byte counts', () => {
  const line = renderProgressLine({
    label: 'Copying files',
    bytesCompleted: 500_000,
    bytesTotal: 1_000_000,
  });

  expect(line).toContain('Copying files');
  expect(line).toContain(' 50%');
  expect(line).toContain('of');
  // Half filled, half empty.
  expect(line).toContain('█'.repeat(12) + '░'.repeat(12));
});

test('renderProgressLine omits counts when there are no bytes to count', () => {
  const line = renderProgressLine({ label: 'Preparing' });

  expect(line).toContain('Preparing');
  expect(line).toContain('100%');
  expect(line).not.toContain(' of ');
});

test('renderProgressLine pads the label to the given width', () => {
  expect(renderProgressLine({ label: 'Preparing' }, 20)).toContain(
    `Preparing${' '.repeat(11)}  [`
  );
});

test('shouldRedraw only allows through a changed percentage', () => {
  const progress: DisplayProgress = {
    label: 'Copying',
    bytesCompleted: 50,
    bytesTotal: 100,
  };

  expect(shouldRedraw(progress, undefined)).toEqual(true);
  expect(shouldRedraw(progress, 49)).toEqual(true);
  expect(shouldRedraw(progress, 50)).toEqual(false);
});

test('a terminal display redraws one line in place', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, true);

  display.update({ label: 'Copying', bytesCompleted: 0, bytesTotal: 100 });
  display.update({ label: 'Copying', bytesCompleted: 50, bytesTotal: 100 });
  display.finish();

  const written = stream.toString();
  expect(written.split(ERASE_LINE)).toHaveLength(3);
  expect(written).toContain('  0%');
  expect(written).toContain(' 50%');
  // Only `finish` ends the line, so the bar stays on its own row throughout.
  expect(written.endsWith('\n')).toEqual(true);
  expect(written.slice(0, -1)).not.toContain('\n');
});

test('a non-terminal display writes one line per change', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, false);

  display.update({ label: 'Copying', bytesCompleted: 0, bytesTotal: 100 });
  display.update({ label: 'Copying', bytesCompleted: 50, bytesTotal: 100 });
  display.finish();

  const lines = stream.toString().trimEnd().split('\n');
  expect(lines).toHaveLength(2);
  // \u001b is ESC: no cursor control at all, since there is no cursor here.
  expect(stream.toString()).not.toContain('\u001b');
});

test('updates that would redraw the same percentage are dropped', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, false);

  for (const bytesCompleted of [10, 10, 10]) {
    display.update({ label: 'Copying', bytesCompleted, bytesTotal: 100 });
  }

  expect(stream.toString().trimEnd().split('\n')).toHaveLength(1);
});

test('reaching a new step always draws, even at the same percentage', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, false);

  // Both render 100%, so only a label change distinguishes them.
  display.update({ label: 'Preparing' });
  display.update({ label: 'Writing manifest' });

  const lines = stream.toString().trimEnd().split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain('Preparing');
  expect(lines[1]).toContain('Writing manifest');
});

test('a non-terminal display leaves the cursor alone when finishing', () => {
  const stream = mockWritable();
  const display = new ProgressDisplay(stream, false);

  display.finish();

  expect(stream.toString()).toEqual('');
});
