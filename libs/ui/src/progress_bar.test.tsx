import { render } from '../test/react_testing_library';

import { ProgressBar } from './progress_bar';

it('renders ProgressBar with defaults', () => {
  const { container } = render(<ProgressBar />);
  expect(container.firstChild).toMatchSnapshot();
});
