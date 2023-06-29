import { render } from '../../test/react_testing_library';
import { Absolute } from './absolute';

test('Renders Absolute top right', () => {
  const { container } = render(<Absolute top right padded />);
  expect(container.firstChild).toHaveStyleRule('position', 'absolute');
  expect(container.firstChild).toHaveStyleRule('top', '0');
  expect(container.firstChild).toHaveStyleRule('right', '0');
  expect(container.firstChild).toHaveStyleRule('padding', '1rem');
});

test('Renders Absolute bottom left', () => {
  const { container } = render(<Absolute bottom left />);
  expect(container.firstChild).toHaveStyleRule('bottom', '0');
  expect(container.firstChild).toHaveStyleRule('left', '0');
});
