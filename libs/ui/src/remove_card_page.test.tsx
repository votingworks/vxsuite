import React from 'react';
import { render } from '@testing-library/react';

import { RemoveCardPage } from './remove_card_page';

test('renders RemoveCardPage', () => {
  const { container } = render(<RemoveCardPage />);
  expect(container.firstChild).toMatchSnapshot();
});
