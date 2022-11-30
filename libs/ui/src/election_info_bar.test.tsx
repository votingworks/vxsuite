import React from 'react';
import { render, screen } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { ElectionInfoBar } from './election_info_bar';

test('Renders ElectionInfoBar with appropriate information', () => {
  const { container } = render(
    <ElectionInfoBar
      electionDefinition={electionSampleDefinition}
      machineId="0000"
      codeVersion="DEV"
      mode="admin"
    />
  );
  screen.getByText('General Election');
  screen.getByText('Nov 3, 2020');
  screen.getByText('Franklin County,');
  screen.getByText('State of Hamilton');
  screen.getByText(hasTextAcrossElements('Software VersionDEV'));
  screen.getByText(hasTextAcrossElements('Machine ID0000'));
  screen.getByText(hasTextAcrossElements(/^Election ID.{10}$/));
  expect(container).toMatchSnapshot();
});

test('Renders ElectionInfoBar with all precincts when specified', () => {
  render(
    <ElectionInfoBar
      electionDefinition={electionSampleDefinition}
      machineId="0000"
      codeVersion="DEV"
      mode="admin"
      precinctSelection={ALL_PRECINCTS_SELECTION}
    />
  );
  screen.getByText('All Precincts,');
});

test('Renders ElectionInfoBar with specific precinct', () => {
  render(
    <ElectionInfoBar
      electionDefinition={electionSampleDefinition}
      machineId="0002"
      codeVersion="DEV"
      mode="admin"
      precinctSelection={singlePrecinctSelectionFor('23')}
    />
  );
  screen.getByText('Center Springfield,');
});

test('Renders ElectionInfoBar without admin info in default voter mode', () => {
  render(
    <ElectionInfoBar
      electionDefinition={electionSampleDefinition}
      machineId="0002"
      codeVersion="DEV"
      precinctSelection={singlePrecinctSelectionFor('23')}
    />
  );
  expect(screen.queryByText(/Software Version/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Machined ID/)).not.toBeInTheDocument();
});
