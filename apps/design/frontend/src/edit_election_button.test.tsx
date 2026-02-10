import { expect, test } from 'vitest';
import React from 'react';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import {
  blankElectionRecord,
  electionListing,
  generalElectionRecord,
} from '../test/fixtures';
import { render, screen } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { EditElectionButton } from './edit_election_button';
import { routes } from './routes';
import { jurisdiction } from '../test/api_helpers';

function renderButton(element: React.ReactElement) {
  const history = createMemoryHistory();

  const ui = withRoute(element, {
    paramPath: routes.root.path,
    path: routes.root.path,
    history,
  });

  return {
    ...render(ui),
    history,
  };
}

test('navigates to election edit screen when clicked', () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const { history } = renderButton(
    <EditElectionButton election={electionListing(electionRecord)} />
  );

  userEvent.click(screen.getByRole('button', { name: `Edit ${election.title}` }));
  expect(history.location.pathname).toEqual(`/elections/${election.id}`);
});

test('label says Untitled Election for elections without a title', () => {
  const electionRecord = blankElectionRecord(jurisdiction);
  renderButton(
    <EditElectionButton election={electionListing(electionRecord)} />
  );
  screen.getByRole('button', { name: 'Edit Untitled Election' });
});
