import { electionGeneralDefinition } from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library';
import { Seal } from './seal';

test('sets styles according to props', () => {
  render(
    <Seal
      seal={electionGeneralDefinition.election.seal}
      maxWidth="7rem"
      style={{ margin: '1rem' }}
    />
  );

  const seal = screen.getByAltText('Seal');
  expect(seal).toHaveStyle({
    maxWidth: '7rem',
    maxHeight: '7rem',
    margin: '1rem',
  });
});

test('varies container styling based on UI theme', () => {
  const lightThemeSeal = render(
    <Seal seal={electionGeneralDefinition.election.seal} maxWidth="250px" />,
    { vxTheme: { colorMode: 'contrastHighDark' } }
  );

  const darkThemeSeal = render(
    <Seal seal={electionGeneralDefinition.election.seal} maxWidth="250px" />,
    { vxTheme: { colorMode: 'contrastHighDark' } }
  );

  expect(
    window.getComputedStyle(darkThemeSeal.container.children[0])
  ).not.toEqual(window.getComputedStyle(lightThemeSeal.container.children[0]));
});
