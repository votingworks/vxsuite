import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';

import { Paths } from '@votingworks/mark-flow-ui';
import { render } from '../../test/test_utils';
import { act, screen } from '../../test/react_testing_library';
import { Ballot } from './ballot';

test('renders voter settings page at appropriate route', async () => {
  const history = createMemoryHistory({
    initialEntries: ['/some/initial/path'],
  });

  render(<Ballot />, { history });

  expect(history.location.pathname).toEqual('/some/initial/path');

  act(() => {
    history.push(Paths.VOTER_SETTINGS);
  });

  expect(history.location.pathname).toEqual(Paths.VOTER_SETTINGS);

  // Verify a few expected elements:
  await screen.findByRole('heading', { name: /settings/i });
  userEvent.click(screen.getByRole('tab', { name: /size/i }));
  screen.getByRole('radio', { name: /extra-large/i });

  userEvent.click(screen.getButton(/done/i));

  expect(history.location.pathname).toEqual('/some/initial/path');
});
