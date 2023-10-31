import { Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen } from '../../test/react_testing_library';

import { render } from '../../test/test_utils';

import { NotFoundPage } from './not_found_page';

it('renders NotFoundPage', () => {
  const resetBallot = jest.fn();
  render(<Route path="/" component={NotFoundPage} />, {
    resetBallot,
    route: '/foobar-not-found-path',
  });
  screen.getByRole('heading', { name: 'Page Not Found.' });
  screen.getByText(
    hasTextAcrossElements('No page exists at /foobar-not-found-path.')
  );
  userEvent.click(screen.getByText('Start Over'));
  expect(resetBallot).toHaveBeenCalled();
});
