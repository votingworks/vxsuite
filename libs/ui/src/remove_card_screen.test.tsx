import { render } from '../test/react_testing_library';

import { RemoveCardScreen } from './remove_card_screen';

describe('RemoveCardPage', () => {
  test('says "Remove card"', () => {
    const { getByText } = render(<RemoveCardScreen productName="VxTest" />);
    getByText('Remove card to unlock VxTest');
  });
});
