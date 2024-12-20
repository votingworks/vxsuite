import { render } from '../test/react_testing_library';

import { ProgressEllipsis } from './progress_ellipsis';

test('renders ProgressEllipsis', () => {
  const { container } = render(<ProgressEllipsis />);
  expect(container).toMatchSnapshot();
});
