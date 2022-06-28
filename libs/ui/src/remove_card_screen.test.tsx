import React from 'react';
import { render } from '@testing-library/react';

import { RemoveCardScreen } from './remove_card_screen';

test('renders RemoveCardPage', () => {
  const { container } = render(<RemoveCardScreen />);
  expect(container.firstChild).toMatchSnapshot();
});
