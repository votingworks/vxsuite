import { describe, test } from 'vitest';
import { render } from '../test/react_testing_library.js';

import { RemoveCardScreen } from './remove_card_screen.js';

describe('RemoveCardPage', () => {
  test('says "Remove card"', () => {
    const { getByText } = render(<RemoveCardScreen productName="VxTest" />);
    getByText('Remove card to unlock VxTest');
  });
});
