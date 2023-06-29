import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../test/react_testing_library';
import { DisplaySettingsPage } from './display_settings_page';

test('returns to previous URL on close', () => {
  const history = createMemoryHistory();
  history.push('/initial-url');
  history.push('/display-settings');

  render(
    <Router history={history}>
      <DisplaySettingsPage />
    </Router>
  );

  expect(history.location.pathname).toEqual('/display-settings');

  userEvent.click(screen.getButton(/done/i));

  expect(history.location.pathname).toEqual('/initial-url');
});
