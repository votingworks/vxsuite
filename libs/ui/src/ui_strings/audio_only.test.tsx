import { Button } from '../button';
import { AudioOnly } from '.';
import { render, screen } from '../../test/react_testing_library';

test('hides content without removing from a11y tree', () => {
  render(
    <Button onPress={() => undefined}>
      Click <AudioOnly>here</AudioOnly>
    </Button>
  );

  screen.getButton('Click here');

  // Very basic verification of a subset of the styles applied to `AudioOnly`:
  const audioOnlyElement = screen.getByText('here');
  expect(audioOnlyElement).toHaveStyleRule('width', '1px');
  expect(audioOnlyElement).toHaveStyleRule('height', '1px');
});
