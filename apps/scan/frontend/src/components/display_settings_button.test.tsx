import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';

import { DisplaySettingsButton } from './display_settings_button';
import { render, screen } from '../../test/react_testing_library';
import { Paths } from '../constants';

test('navigates to settings screen', () => {
  const history = createMemoryHistory();
  history.push('/');

  render(
    <Router history={history}>
      <DisplaySettingsButton />
    </Router>
  );

  expect(history.location.pathname).toEqual('/');

  userEvent.click(screen.getButton(/Display Settings/i));

  expect(history.location.pathname).toEqual(Paths.DISPLAY_SETTINGS);
});
