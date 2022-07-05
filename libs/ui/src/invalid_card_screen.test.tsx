import React from 'react';
import { render } from '@testing-library/react';

import { InvalidCardScreen } from './invalid_card_screen';

describe('InvalidCardScreen', () => {
  test('says "Invalid Card"', () => {
    const { getByText } = render(<InvalidCardScreen />);
    getByText('Invalid Card', { exact: false });
  });
});
