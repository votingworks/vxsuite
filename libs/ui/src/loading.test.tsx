import { expect, test } from 'vitest';
import { render, screen } from '../test/react_testing_library';

import { Loading } from './loading';

test('Renders Loading with defaults', () => {
  const { container } = render(<Loading />);
  screen.getByText('Loading');
  expect(container.firstChild).toMatchSnapshot();
});

test('Renders Loading with: fullscreen, tag, label, and animation duration', () => {
  const { container } = render(
    <Loading isFullscreen as="p" animationDurationS={1}>
      Printing
    </Loading>
  );
  expect(container.firstChild).toHaveStyleRule('display', 'flex');
  expect(container.firstChild).toHaveStyleRule('flex', '1');
  const progressEllipsis = screen.getByText('Printing');
  expect(progressEllipsis).toHaveStyleRule(
    'animation',
    expect.stringContaining('1s'),
    { modifier: '&::after' }
  );
});
