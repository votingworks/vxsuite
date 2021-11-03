import React from 'react';
import { renderInAppContext } from '../../test/renderInAppContext';
import { LoadElectionScreen } from './LoadElectionScreen';

test('shows a message that there is no election configuration', () => {
  const { getByText } = renderInAppContext(
    <LoadElectionScreen setElectionDefinition={jest.fn()} />
  );

  getByText('Load Election Configuration');
});
