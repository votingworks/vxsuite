import { expect, test } from 'vitest';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../test/react_testing_library';
import { VoterSettingsPage } from './voter_settings_page';

test('returns to previous URL on close', () => {
  const history = createMemoryHistory();
  history.push('/initial-url');
  history.push('/voter-settings');

  render(
    <Router history={history}>
      <VoterSettingsPage />
    </Router>
  );

  expect(history.location.pathname).toEqual('/voter-settings');

  userEvent.click(screen.getButton(/done/i));

  expect(history.location.pathname).toEqual('/initial-url');
});
