import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { LoadElectionScreen } from './load_election_screen';

test('shows a message that there is no election configuration', () => {
  const { getByText } = renderInAppContext(
    <LoadElectionScreen setElectionDefinition={jest.fn()} />
  );

  getByText('Load Election Configuration');
});
