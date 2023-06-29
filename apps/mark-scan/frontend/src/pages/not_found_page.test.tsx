import { Route } from 'react-router-dom';
import { fireEvent, screen } from '../../test/react_testing_library';

import { render } from '../../test/test_utils';

import { NotFoundPage } from './not_found_page';

it('renders NotFoundPage', () => {
  const resetBallot = jest.fn();
  const { container } = render(<Route path="/" component={NotFoundPage} />, {
    resetBallot,
    route: '/foobar-not-found-path',
  });
  expect(container.firstChild).toMatchSnapshot();
  fireEvent.click(screen.getByText('Start Over'));
  expect(resetBallot).toHaveBeenCalled();
});
