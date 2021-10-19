import React from 'react';
import { render } from '@testing-library/react';

import { Button } from './Button';
import { ButtonList } from './ButtonList';

test('Renders ButtonList with defaults', () => {
  const { container } = render(
    <ButtonList>
      <Button onPress={jest.fn()}>foo</Button>
      <Button onPress={jest.fn()}>foo</Button>
      <Button onPress={jest.fn()}>foo</Button>
    </ButtonList>
  );
  expect(container.firstChild).toMatchSnapshot();
});
