import { expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { render, screen } from '../test/react_testing_library.js';
import { Seal } from './seal.js';

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
    maxWidth: '112px',
    maxHeight: '112px',
    margin: '16px',
  });
});

test('varies container styling based on UI theme', () => {
  render(<Seal seal={electionGeneral.seal} maxWidth="250px" />, {
    vxTheme: { colorMode: 'contrastMedium' },
  });
  render(<Seal seal={electionGeneral.seal} maxWidth="250px" />, {
    vxTheme: { colorMode: 'contrastLow' },
  });

  const [lightThemeSeal, darkThemeSeal] = screen.getAllByAltText('Seal');
  expect(window.getComputedStyle(darkThemeSeal!).backgroundColor).not.toEqual(
    window.getComputedStyle(lightThemeSeal!).backgroundColor
  );
});

test('renders nothing if seal is empty string (special case for CDF)', () => {
  render(<Seal seal="" maxWidth="7rem" />);
  expect(screen.queryByAltText('Seal')).not.toBeInTheDocument();
});
