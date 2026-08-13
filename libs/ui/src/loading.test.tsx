import { afterEach, expect, test, vi } from 'vitest';
import { act, render, screen } from '../test/react_testing_library';

import { FULLSCREEN_LOADING_DELAY_MS, Loading } from './loading';

afterEach(() => {
  vi.useRealTimers();
});

test('Renders Loading with defaults', () => {
  const { container } = render(<Loading />);
  screen.getByText('Loading');
  expect(container.firstChild).toMatchSnapshot();
});

test('Renders Loading with: fullscreen, tag, label, and animation duration', () => {
  vi.useFakeTimers();
  const { container } = render(
    <Loading isFullscreen as="p" animationDurationS={1}>
      Printing
    </Loading>
  );
  expect(container.firstChild).toHaveStyleRule('display', 'flex');
  expect(container.firstChild).toHaveStyleRule('flex', '1');

  // The fullscreen indicator is delayed to avoid flashing on fast loads
  expect(screen.queryByText('Printing')).not.toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(FULLSCREEN_LOADING_DELAY_MS);
  });

  const progressEllipsis = screen.getByText('Printing');
  expect(progressEllipsis).toHaveStyleRule(
    'animation',
    expect.stringContaining('1s'),
    { modifier: '&::after' }
  );
});
