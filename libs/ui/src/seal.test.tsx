import { readElectionGeneral } from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library';
import { Seal } from './seal';

const electionGeneral = readElectionGeneral();

test('sets styles according to props', () => {
  render(
    <Seal
      seal={electionGeneral.seal}
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
    <Seal seal={electionGeneral.seal} maxWidth="250px" />,
    { vxTheme: { colorMode: 'contrastHighDark' } }
  );

  const darkThemeSeal = render(
    <Seal seal={electionGeneral.seal} maxWidth="250px" />,
    { vxTheme: { colorMode: 'contrastHighDark' } }
  );

  expect(
    window.getComputedStyle(darkThemeSeal.container.children[0])
  ).not.toEqual(window.getComputedStyle(lightThemeSeal.container.children[0]));
});

test('renders nothing if seal is empty string (special case for CDF)', () => {
  render(<Seal seal="" maxWidth="7rem" />);
  expect(screen.queryByAltText('Seal')).not.toBeInTheDocument();
});
