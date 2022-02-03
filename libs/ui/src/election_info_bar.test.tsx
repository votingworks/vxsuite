import React from 'react';
import { render } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ElectionInfoBar } from './election_info_bar';

test('Renders nothing when there is no election', async () => {
  const { container } = render(
    <ElectionInfoBar
      electionDefinition={undefined}
      machineId="0000"
      codeVersion="DEV"
      mode="admin"
    />
  );
  expect(container).toMatchSnapshot();
});

test('Renders ElectionInfoBar without precinct information by default', async () => {
  const { container } = render(
    <ElectionInfoBar
      electionDefinition={electionSampleDefinition}
      machineId="0000"
      codeVersion="DEV"
      mode="admin"
    />
  );
  expect(container).toMatchSnapshot();
});

test('Renders ElectionInfoBar with all precincts wording', async () => {
  const { container } = render(
    <ElectionInfoBar
      electionDefinition={electionSampleDefinition}
      machineId="0000"
      codeVersion="DEV"
      showPrecinctInfo
    />
  );
  expect(container).toMatchSnapshot();
});

test('Renders admin ElectionInfoBar with precinct set', async () => {
  const { container } = render(
    <ElectionInfoBar
      mode="admin"
      electionDefinition={electionSampleDefinition}
      machineId="0002"
      codeVersion="DEV"
      showPrecinctInfo
      precinctId="23"
    />
  );
  expect(container).toMatchSnapshot();
});
