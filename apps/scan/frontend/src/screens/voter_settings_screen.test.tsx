import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../test/react_testing_library';
import { VoterSettingsScreen } from './voter_settings_screen';

test('returns to previous URL on close', () => {
  const history = createMemoryHistory();
  history.push('/initial-url');
  history.push('/voter-settings');

  render(
    <Router history={history}>
      <VoterSettingsScreen />
    </Router>
  );

  expect(history.location.pathname).toEqual('/voter-settings');

  userEvent.click(screen.getButton(/done/i));

  expect(history.location.pathname).toEqual('/initial-url');
});
