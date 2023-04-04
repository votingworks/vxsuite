import React from 'react';
import {
  electionSampleDefinition,
  primaryElectionSampleDefinition,
} from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library';
import { Seal } from './seal';

test('Seal with svg value', () => {
  render(<Seal seal={electionSampleDefinition.election.seal} />);
  expect(
    screen.queryByText('Seal of Montgomery County, Maryland.')
  ).toBeInTheDocument();
  // expect(screen.queryByAltText('state seal')).toBeInTheDocument();
});

test('Seal with url value', () => {
  render(<Seal sealUrl={primaryElectionSampleDefinition.election.sealUrl} />);
  expect(screen.queryByAltText('state seal')).toBeInTheDocument();
});

test('varies container styling based on UI theme', () => {
  const lightThemeSeal = render(
    <Seal sealUrl={primaryElectionSampleDefinition.election.sealUrl} />,
    { vxTheme: { colorMode: 'contrastHighDark' } }
  );

  const darkThemeSeal = render(
    <Seal sealUrl={primaryElectionSampleDefinition.election.sealUrl} />,
    { vxTheme: { colorMode: 'contrastHighDark' } }
  );

  expect(
    window.getComputedStyle(darkThemeSeal.container.children[0])
  ).not.toEqual(window.getComputedStyle(lightThemeSeal.container.children[0]));
});
