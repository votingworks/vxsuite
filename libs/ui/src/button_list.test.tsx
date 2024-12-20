import { render, screen } from '../test/react_testing_library';

import { Button } from './button';
import { ButtonList } from './button_list';

test('Renders ButtonList with defaults', () => {
  const onPressFoo = jest.fn();
  const onPressBar = jest.fn();
  const onPressBaz = jest.fn();

  render(
    <ButtonList>
      <Button onPress={onPressFoo}>foo</Button>
      <Button onPress={onPressBar}>bar</Button>
      <Button onPress={onPressBaz}>baz</Button>
    </ButtonList>
  );

  expect(onPressFoo).not.toHaveBeenCalled();
  screen.getButton('foo').click();
  expect(onPressFoo).toHaveBeenCalledTimes(1);

  expect(onPressBar).not.toHaveBeenCalled();
  screen.getButton('bar').click();
  expect(onPressBar).toHaveBeenCalledTimes(1);

  expect(onPressBaz).not.toHaveBeenCalled();
  screen.getButton('baz').click();
  expect(onPressBaz).toHaveBeenCalledTimes(1);
});
