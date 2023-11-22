import { render } from '../test/react_testing_library';

import { Screen } from './screen';

describe('renders Screen', () => {
  test('with defaults', () => {
    const { container } = render(<Screen>Screen</Screen>, {
      vxTheme: { colorMode: 'contrastMedium' },
    });
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('flex-direction', 'column');
    expect(screen).toHaveStyleRule('height', '100%');
    expect(screen).not.toHaveStyleRule('background-color');
    expect(screen).toHaveStyleRule('display', 'none', {
      media: 'print',
    });
  });

  test('with flexDirection', () => {
    const { container } = render(<Screen flexDirection="row">Screen</Screen>, {
      vxTheme: { colorMode: 'contrastMedium' },
    });
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('flex-direction', 'row');
  });
});
