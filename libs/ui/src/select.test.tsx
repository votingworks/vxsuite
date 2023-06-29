import { render } from '../test/react_testing_library';

import { Select } from './select';

describe('renders Select', () => {
  test('large', () => {
    const { container } = render(<Select large />);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule(
      'background-position',
      'right 1.125em center'
    );
    expect(screen).toHaveStyleRule('background-size', '0.85em auto');
    expect(screen).toHaveStyleRule('padding', '1em 2.5em 1em 1.75em');
    expect(screen).toHaveStyleRule('font-size', '1.25em');
    expect(screen).not.toHaveStyleRule('width', '100%');
  });
  test('small', () => {
    const { container } = render(<Select small />);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('background-position', 'right 0.5em center');
    expect(screen).toHaveStyleRule('background-size', '0.5em auto');
    expect(screen).toHaveStyleRule('padding', '0.35em 1.25em 0.35em 0.5em');
    expect(screen).not.toHaveStyleRule('width', '100%');
  });
  test('fullWidth', () => {
    const { container } = render(<Select fullWidth />);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('width', '100%');
    expect(screen).toHaveStyleRule('background-color', 'rgb(211,211,211)');
    expect(screen).toHaveStyleRule(
      'background-image',
      'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 287.87"><path style="fill:darkslategrey" d="M502.54,9.46A30.83,30.83,0,0,0,479.78,0H32.22A30.84,30.84,0,0,0,9.63,9.46,30.81,30.81,0,0,0,0,31.87,30.8,30.8,0,0,0,9.46,54.46l224.13,224q22.41,18.91,44.82,0L502.54,54.29q19-22.49-.17-44.83Z" /></svg>\')'
    );
  });
  test('primary', () => {
    const { container } = render(<Select primary />);
    const screen = container.firstChild;
    expect(screen).toHaveStyleRule('background-color', 'rgb(71,167,75)');
    expect(screen).toHaveStyleRule(
      'background-image',
      'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 287.87"><path style="fill:white" d="M502.54,9.46A30.83,30.83,0,0,0,479.78,0H32.22A30.84,30.84,0,0,0,9.63,9.46,30.81,30.81,0,0,0,0,31.87,30.8,30.8,0,0,0,9.46,54.46l224.13,224q22.41,18.91,44.82,0L502.54,54.29q19-22.49-.17-44.83Z" /></svg>\')'
    );
  });
});
