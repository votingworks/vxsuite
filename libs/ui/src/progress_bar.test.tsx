import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { ProgressBar } from './progress_bar';

test('0 progress', () => {
  render(<ProgressBar progress={0} />);
  const progressBar = screen.getByRole('progressbar');
  expect(progressBar.firstChild).toHaveStyle({ width: '0%' });
});

test('50% progress', () => {
  render(<ProgressBar progress={0.5} />);
  const progressBar = screen.getByRole('progressbar');
  expect(progressBar.firstChild).toHaveStyle({ width: '50%' });
});

test('100% progress', () => {
  render(<ProgressBar progress={1} />);
  const progressBar = screen.getByRole('progressbar');
  expect(progressBar.firstChild).toHaveStyle({ width: '100%' });
});
