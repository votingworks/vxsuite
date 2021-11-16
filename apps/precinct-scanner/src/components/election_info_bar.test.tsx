import React from 'react';
import { render } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { PrecinctIdSchema, unsafeParse } from '@votingworks/types';
import { ElectionInfoBar } from './election_info_bar';
import { AppContext } from '../contexts/app_context';

test('Renders ElectionInfoBar', async () => {
  const { container } = render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'DEV' },
      }}
    >
      <ElectionInfoBar />
    </AppContext.Provider>
  );
  expect(container).toMatchSnapshot();
});

test('Renders admin ElectionInfoBar with precinct set', async () => {
  const { container } = render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        currentPrecinctId: unsafeParse(PrecinctIdSchema, '23'),
        machineConfig: { machineId: '0002', codeVersion: 'DEV' },
      }}
    >
      <ElectionInfoBar mode="admin" />
    </AppContext.Provider>
  );
  expect(container).toMatchSnapshot();
});
