import React from 'react';
import { render } from '../../test/react_testing_library';

import { ChoiceButton } from './choice_button';

const onPress = jest.fn();

it('renders ChoiceButton', () => {
  const { container } = render(
    <ChoiceButton choice="foo" isSelected={false} onPress={onPress}>
      foo
    </ChoiceButton>
  );
  expect(container.firstChild).toMatchSnapshot();
});
