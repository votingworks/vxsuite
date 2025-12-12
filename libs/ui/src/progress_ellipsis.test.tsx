import { expect, test } from 'vitest';
import { render } from '../test/react_testing_library';

import { ProgressEllipsis } from './progress_ellipsis';

test('renders ProgressEllipsis', () => {
  const { container } = render(<ProgressEllipsis />);
  expect(container).toMatchSnapshot();
});

test('renders ProgressEllipsis with custom animation duration', () => {
  const { container } = render(<ProgressEllipsis animationDurationS={1} />);
  expect(container.firstChild).toHaveStyleRule(
    'animation',
    expect.stringContaining('1s'),
    { modifier: '&::after' }
  );
});
