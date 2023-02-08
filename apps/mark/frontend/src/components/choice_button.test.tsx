import React from 'react';
import { render } from '@testing-library/react';

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
