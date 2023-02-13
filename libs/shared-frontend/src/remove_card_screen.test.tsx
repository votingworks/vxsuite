import React from 'react';
import { render } from '@testing-library/react';

import { RemoveCardScreen } from './remove_card_screen';

describe('RemoveCardPage', () => {
  test('says "Remove card"', () => {
    const { getByText } = render(<RemoveCardScreen productName="VxTest" />);
    getByText('VxTest Unlocked');
    getByText('Remove card to continue.');
  });
});
