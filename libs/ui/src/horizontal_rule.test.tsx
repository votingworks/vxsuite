import { render } from '../test/react_testing_library';

import { HorizontalRule } from './horizontal_rule';

describe('Renders HorizontalRule', () => {
  test('with defaults', () => {
    render(<HorizontalRule>or</HorizontalRule>);
  });

  test('with custom green color', () => {
    render(<HorizontalRule color="#00FF00">or</HorizontalRule>);
  });

  test('without children', () => {
    render(<HorizontalRule />);
  });
});
